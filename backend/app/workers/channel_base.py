"""Shared channel worker logic — common processing for all channel workers.

Each channel worker calls process_notification() which handles:
1. Load notification from DB with SELECT FOR UPDATE (prevents double-delivery)
2. Guard against duplicate processing (idempotency)
3. Update status to processing
4. Render template (if applicable) and deliver via channel adapter
5. Update status to delivered or failed
6. Write NotificationLog entries for each transition

Key design decisions:
- SELECT FOR UPDATE on notification fetch prevents race conditions under
  task_acks_late (two workers seeing QUEUED simultaneously).
- Template rendering is wrapped in try/except so Jinja2 errors produce
  FAILED status instead of leaving notifications stuck in PROCESSING.
- The outer except block marks the notification FAILED if any unexpected
  error occurs after the PROCESSING commit, preventing zombie records.
"""

import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlmodel import col

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


def _render_body(session: Session, notification: Notification, event: Event) -> None:
    """Render notification body from template or fall back to JSON payload.

    Template errors are caught and recorded — they result in FAILED status,
    not an unhandled crash.
    """
    if notification.rendered_body is not None:
        return

    if event.template_id:
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
        notification.rendered_body = json.dumps(event.payload or {}, default=str)


def process_notification(notification_id: str, channel: str) -> dict:
    """Process a notification through the delivery pipeline.

    Returns a dict with status and metadata for Celery result tracking.
    """
    session = get_sync_session()
    committed_processing = False
    try:
        # SELECT FOR UPDATE prevents two workers from both reading QUEUED
        notification = session.execute(
            select(Notification).where(col(Notification.id) == notification_id).with_for_update()
        ).scalar_one_or_none()

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
            session.commit()  # release FOR UPDATE lock
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
        committed_processing = True

        # Fetch event once for template rendering + adapter kwargs
        event = session.get(Event, str(notification.event_id))
        if event is None:
            raise ValueError(f"Event {notification.event_id} not found for notification")

        # --- Render body (template errors caught and recorded) ---
        try:
            _render_body(session, notification, event)
        except Exception as exc:
            logger.error(
                "Template rendering failed for notification %s: %s",
                notification_id,
                exc,
            )
            notification.status = NotificationStatus.FAILED
            notification.error_message = f"Template error: {exc}"
            notification.failed_at = utc_now()
            notification.updated_at = utc_now()
            session.add(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=NotificationStatus.PROCESSING,
                    new_status=NotificationStatus.FAILED,
                    error_message=f"Template error: {exc}",
                )
            )
            session.commit()
            _maybe_complete_event(session, notification.event_id)
            return {
                "status": "failed",
                "notification_id": notification_id,
                "channel": channel,
                "reason": f"template_error: {exc}",
            }

        # --- Deliver via channel adapter ---
        adapter = get_adapter(channel)
        result = adapter.send(
            recipient=notification.recipient_address,
            subject=notification.rendered_subject,
            body=notification.rendered_body or "",
            webhook_secret=notification.webhook_secret,
            event_type=event.event_type,
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

        # Check if all notifications for the event are terminal → update event
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
        # If we already committed PROCESSING, mark as FAILED so it's not a zombie
        if committed_processing:
            try:
                notification = session.get(Notification, notification_id)
                if notification and notification.status == NotificationStatus.PROCESSING:
                    notification.status = NotificationStatus.FAILED
                    notification.error_message = "Unexpected worker error"
                    notification.failed_at = utc_now()
                    notification.updated_at = utc_now()
                    session.add(
                        NotificationLog(
                            notification_id=notification.id,
                            previous_status=NotificationStatus.PROCESSING,
                            new_status=NotificationStatus.FAILED,
                            error_message="Unexpected worker error",
                        )
                    )
                    session.commit()
                    _maybe_complete_event(session, notification.event_id)
            except Exception:
                logger.exception(
                    "Failed to mark notification %s as FAILED after error",
                    notification_id,
                )
        logger.exception("Failed to process notification %s", notification_id)
        raise
    finally:
        session.close()


def _maybe_complete_event(session, event_id) -> None:  # type: ignore[type-arg]
    """If all notifications for an event are terminal, update the event status.

    Uses SELECT FOR UPDATE to prevent concurrent workers from corrupting
    the event status when multiple notifications finish simultaneously.
    """
    event = session.execute(
        select(Event).where(Event.id == event_id).with_for_update()
    ).scalar_one_or_none()
    if event is None:
        return

    notifications = (
        session.execute(select(Notification).where(Notification.event_id == event_id))
        .scalars()
        .all()
    )

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
