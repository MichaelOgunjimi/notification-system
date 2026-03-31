"""Shared channel worker logic — common processing for all channel workers.

Each channel worker calls process_notification() which handles:
1. Load notification from DB
2. Guard against duplicate processing (idempotency)
3. Update status to processing
4. Render template (if applicable) and deliver via channel adapter
5. Update status to delivered or failed
6. Write NotificationLog entries for each transition
"""

import json
import logging

from sqlalchemy import select

from app.models.enums import EventStatus, NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.services.integrations import get_adapter
from app.utils.datetime import utc_now
from app.workers.database import get_sync_session

logger = logging.getLogger(__name__)

# Statuses that are safe to process — anything else means already handled
_PROCESSABLE = {NotificationStatus.QUEUED, NotificationStatus.PENDING}

# Terminal statuses — notification won't change again
_TERMINAL = {
    NotificationStatus.DELIVERED,
    NotificationStatus.FAILED,
    NotificationStatus.DEAD_LETTER,
    NotificationStatus.CANCELLED,
}


def process_notification(notification_id: str, channel: str) -> dict:
    """Process a notification through the delivery pipeline.

    Returns a dict with status and metadata for Celery result tracking.
    """
    session = get_sync_session()
    try:
        notification = session.get(Notification, notification_id)
        if notification is None:
            logger.error("Notification %s not found", notification_id)
            return {"status": "error", "reason": "notification_not_found"}

        # Guard: skip if already processed (handles Celery redelivery)
        if notification.status not in _PROCESSABLE:
            logger.warning(
                "Notification %s already in status %s, skipping",
                notification_id,
                notification.status,
            )
            return {"status": "skipped", "reason": f"already_{notification.status}"}

        # Transition: queued → processing
        prev_status = notification.status
        notification.status = NotificationStatus.PROCESSING
        notification.processing_started_at = utc_now()
        notification.updated_at = utc_now()
        session.add(
            NotificationLog(
                notification_id=notification.id,
                previous_status=prev_status,
                new_status=NotificationStatus.PROCESSING,
            )
        )
        session.commit()

        # --- Render body if not already rendered ---
        if notification.rendered_body is None:
            event = session.get(Event, str(notification.event_id))
            if event and event.template_id:
                from app.models.template import Template
                from app.services.template_service import preview_template

                template = session.get(Template, str(event.template_id))
                if template:
                    variables = event.payload or {}
                    rendered_subject, rendered_body = preview_template(
                        body=template.body,
                        subject=template.subject,
                        variables=variables,
                    )
                    notification.rendered_subject = rendered_subject
                    notification.rendered_body = rendered_body

            # Fallback: use JSON payload as body
            if notification.rendered_body is None:
                notification.rendered_body = json.dumps(event.payload if event else {}, default=str)

        # --- Deliver via channel adapter ---
        event = session.get(Event, str(notification.event_id))
        adapter = get_adapter(channel)
        result = adapter.send(
            recipient=notification.recipient_address,
            subject=notification.rendered_subject,
            body=notification.rendered_body or "",
            webhook_secret=notification.webhook_secret,
            event_type=event.event_type if event else "notification",
            notification_id=str(notification.id),
        )

        notification.provider_response = result.provider_response

        if result.success:
            notification.status = NotificationStatus.DELIVERED
            notification.delivered_at = utc_now()
            notification.updated_at = utc_now()
            session.add(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=NotificationStatus.PROCESSING,
                    new_status=NotificationStatus.DELIVERED,
                    provider_response=result.provider_response,
                )
            )
        else:
            notification.status = NotificationStatus.FAILED
            notification.error_message = result.error_message
            notification.failed_at = utc_now()
            notification.updated_at = utc_now()
            session.add(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=NotificationStatus.PROCESSING,
                    new_status=NotificationStatus.FAILED,
                    error_message=result.error_message,
                    provider_response=result.provider_response,
                )
            )

        session.commit()

        # Check if all notifications for the event are terminal → update event status
        _maybe_complete_event(session, notification.event_id)

        status_label = "delivered" if result.success else "failed"
        logger.info("Notification %s %s via %s", notification_id, status_label, channel)
        return {
            "status": status_label,
            "notification_id": notification_id,
            "channel": channel,
            "recipient": notification.recipient_address,
        }

    except Exception:
        session.rollback()
        logger.exception("Failed to process notification %s", notification_id)
        raise
    finally:
        session.close()


def _maybe_complete_event(session, event_id) -> None:
    """If all notifications for an event are terminal, update the event status.

    Uses SELECT FOR UPDATE to prevent concurrent workers from corrupting
    the event status when multiple notifications finish simultaneously.
    """
    event = session.execute(
        select(Event).where(Event.id == event_id).with_for_update()
    ).scalar_one_or_none()
    if event is None:
        return

    notifications = session.query(Notification).filter(Notification.event_id == event_id).all()

    statuses = {n.status for n in notifications}

    # If any notification is still in-flight, don't update event yet
    if not statuses.issubset(_TERMINAL):
        session.commit()  # Release the FOR UPDATE lock
        return

    if all(s == NotificationStatus.DELIVERED for s in statuses):
        event.status = EventStatus.COMPLETED
    elif NotificationStatus.FAILED in statuses or NotificationStatus.DEAD_LETTER in statuses:
        if NotificationStatus.DELIVERED in statuses:
            event.status = EventStatus.PARTIALLY_FAILED
        else:
            event.status = EventStatus.FAILED
    else:
        event.status = EventStatus.COMPLETED

    event.updated_at = utc_now()
    session.commit()
