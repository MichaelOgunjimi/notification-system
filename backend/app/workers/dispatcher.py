"""Dispatcher worker — picks up events from priority queues and fans out to channel workers."""

import logging

from sqlmodel import col

from app.models.enums import EventStatus, NotificationChannel, NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.utils.datetime import utc_now
from app.workers.celery_app import celery_app
from app.workers.database import get_sync_session

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.dispatcher.dispatch_event", bind=True)
def dispatch_event(self, event_id: str) -> dict:
    """Dispatch an event: update statuses and fan out to channel-specific workers.

    This task runs on the dispatcher worker which consumes from priority queues
    (notifications.high, notifications.medium, notifications.low).
    """
    session = get_sync_session()
    try:
        event = session.get(Event, event_id)
        if event is None:
            logger.error("Event %s not found", event_id)
            return {"status": "error", "reason": "event_not_found"}

        # Update event status to processing
        event.status = EventStatus.PROCESSING
        event.updated_at = utc_now()
        session.commit()

        # Get all pending notifications for this event
        notifications = (
            session.query(Notification)
            .filter(
                col(Notification.event_id == event_id),
                col(Notification.status == NotificationStatus.PENDING),
            )
            .all()
        )

        dispatched = 0
        for notification in notifications:
            # Update status to queued
            notification.status = NotificationStatus.QUEUED
            notification.queued_at = utc_now()
            notification.updated_at = utc_now()

            # Write log entry
            log_entry = NotificationLog(
                notification_id=notification.id,
                previous_status=NotificationStatus.PENDING,
                new_status=NotificationStatus.QUEUED,
            )
            session.add(log_entry)

            # Route to channel-specific worker
            _enqueue_channel_task(notification, self.request.id)
            dispatched += 1

        session.commit()

        logger.info(
            "Dispatched event %s: %d notifications enqueued",
            event_id,
            dispatched,
        )
        return {"status": "dispatched", "event_id": event_id, "notifications": dispatched}

    except Exception:
        session.rollback()
        logger.exception("Failed to dispatch event %s", event_id)
        raise
    finally:
        session.close()


def _enqueue_channel_task(
    notification: Notification, dispatcher_task_id: str | None = None,
) -> None:
    """Route a notification to the appropriate channel worker."""
    notification_id = str(notification.id)

    if notification.channel == NotificationChannel.EMAIL:
        from app.workers.email_worker import send_email
        result = send_email.delay(notification_id)
    elif notification.channel == NotificationChannel.SMS:
        from app.workers.sms_worker import send_sms
        result = send_sms.delay(notification_id)
    elif notification.channel == NotificationChannel.WEBHOOK:
        from app.workers.webhook_worker import send_webhook
        result = send_webhook.delay(notification_id)
    else:
        logger.warning(
            "Unknown channel %s for notification %s",
            notification.channel, notification_id,
        )
        return

    notification.celery_task_id = result.id
