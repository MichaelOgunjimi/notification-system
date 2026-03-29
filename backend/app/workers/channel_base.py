"""Shared channel worker logic — common processing for all channel workers.

Each channel worker calls process_notification() which handles:
1. Load notification from DB
2. Update status to processing
3. Simulate delivery (Phase 2 stub — Phase 3 adds real adapters)
4. Update status to delivered
5. Write NotificationLog entries for each transition

Phase 3 will refactor this to call real adapter classes.
"""

import logging

from app.models.enums import EventStatus, NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.utils.datetime import utc_now
from app.workers.database import get_sync_session

logger = logging.getLogger(__name__)


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

        # Transition: queued → processing
        prev_status = notification.status
        notification.status = NotificationStatus.PROCESSING
        notification.updated_at = utc_now()
        session.add(NotificationLog(
            notification_id=notification.id,
            previous_status=prev_status,
            new_status=NotificationStatus.PROCESSING,
        ))
        session.commit()

        # --- Phase 2 stub: simulate successful delivery ---
        # Phase 3 will replace this with actual adapter calls:
        #   email → Resend API
        #   sms → Twilio API
        #   webhook → HTTP POST
        logger.info(
            "Delivering %s notification %s to %s (stub)",
            channel,
            notification_id,
            notification.recipient_address,
        )

        # Transition: processing → delivered
        notification.status = NotificationStatus.DELIVERED
        notification.delivered_at = utc_now()
        notification.updated_at = utc_now()
        session.add(NotificationLog(
            notification_id=notification.id,
            previous_status=NotificationStatus.PROCESSING,
            new_status=NotificationStatus.DELIVERED,
        ))
        session.commit()

        # Check if all notifications for the event are delivered → update event status
        _maybe_complete_event(session, notification.event_id)

        logger.info("Notification %s delivered via %s", notification_id, channel)
        return {
            "status": "delivered",
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
    """If all notifications for an event are terminal, update the event status."""
    event = session.get(Event, event_id)
    if event is None:
        return

    notifications = (
        session.query(Notification)
        .filter(Notification.event_id == event_id)
        .all()
    )

    statuses = {n.status for n in notifications}

    if all(s == NotificationStatus.DELIVERED for s in statuses):
        event.status = EventStatus.COMPLETED
    elif NotificationStatus.FAILED in statuses or NotificationStatus.DEAD_LETTER in statuses:
        if NotificationStatus.DELIVERED in statuses:
            event.status = EventStatus.PARTIALLY_FAILED
        else:
            event.status = EventStatus.FAILED

    event.updated_at = utc_now()
    session.commit()
