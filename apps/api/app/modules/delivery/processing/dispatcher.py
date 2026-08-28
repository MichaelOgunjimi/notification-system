"""Dispatcher task — picks up events and fans out to channel workers."""

import logging

from sqlalchemy import select
from sqlmodel import col

from app.core.datetime import utc_now
from app.modules.delivery.processing.queues import channel_queue
from app.modules.events.enums import EventStatus
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.notifications.log_model import NotificationLog
from app.modules.notifications.model import Notification
from app.workers.celery_app import celery_app
from app.workers.database import get_sync_session

logger = logging.getLogger(__name__)


@celery_app.task(name="app.modules.delivery.processing.dispatcher.dispatch_event", bind=True)
def dispatch_event(self, event_id: str) -> dict:
    """Dispatch an event: update statuses and fan out to channel-specific workers.

    Commit-before-enqueue: DB status is updated to QUEUED and committed
    before any Celery tasks are sent. This prevents orphaned tasks (tasks
    in Celery with no DB record) and ensures partial enqueue failures
    leave notifications in a recoverable QUEUED state.
    """
    session = get_sync_session()
    try:
        event = session.execute(select(Event).where(col(Event.id) == event_id)).scalar_one_or_none()
        if event is None:
            logger.error("Event %s not found", event_id)
            return {"status": "error", "reason": "event_not_found"}

        # Update event status to processing
        event.status = EventStatus.PROCESSING
        event.updated_at = utc_now()

        # Get all pending notifications for this event
        notifications = (
            session.execute(
                select(Notification).where(
                    col(Notification.event_id) == event_id,
                    col(Notification.status) == NotificationStatus.PENDING,
                )
            )
            .scalars()
            .all()
        )

        # Phase 1: Mark all notifications QUEUED and commit
        for notification in notifications:
            notification.status = NotificationStatus.QUEUED
            notification.queued_at = utc_now()
            notification.updated_at = utc_now()
            session.add(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=NotificationStatus.PENDING,
                    new_status=NotificationStatus.QUEUED,
                )
            )

        session.commit()

        # Phase 2: Enqueue to Celery (after commit — safe to fail partially)
        dispatched = 0
        for notification in notifications:
            try:
                _enqueue_channel_task(notification, self.request.id)
                dispatched += 1
            except Exception:
                logger.exception(
                    "Failed to enqueue notification %s to Celery (status is QUEUED, "
                    "reconciliation will retry)",
                    notification.id,
                )

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
    notification: Notification,
    dispatcher_task_id: str | None = None,
) -> None:
    """Route a notification to the appropriate per-channel priority queue.

    Queue format: notifications.{channel}.{priority}
    e.g. notifications.email.high, notifications.sms.low

    Priority is preserved end-to-end: the dispatcher ran on a priority queue
    (notifications.high/medium/low) and now fans out to a per-channel queue
    that also carries the priority. Each channel scales independently while
    high-priority work is never blocked by a backlog of low-priority work
    within the same channel.
    """
    notification_id = str(notification.id)
    queue = channel_queue(str(notification.channel), str(notification.priority))

    if notification.channel == NotificationChannel.EMAIL:
        from app.workers.email_worker import send_email

        result = send_email.apply_async(args=[notification_id], queue=queue)
    elif notification.channel == NotificationChannel.SMS:
        from app.workers.sms_worker import send_sms

        result = send_sms.apply_async(args=[notification_id], queue=queue)
    elif notification.channel == NotificationChannel.WEBHOOK:
        from app.workers.webhook_worker import send_webhook

        result = send_webhook.apply_async(args=[notification_id], queue=queue)
    else:
        logger.warning(
            "Unknown channel %s for notification %s",
            notification.channel,
            notification_id,
        )
        return

    notification.celery_task_id = result.id
