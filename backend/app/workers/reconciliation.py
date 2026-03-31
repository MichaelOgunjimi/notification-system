"""Reconciliation worker — recovers stuck notifications."""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlmodel import col

from app.models.enums import NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.utils.datetime import utc_now
from app.workers.celery_app import celery_app
from app.workers.database import get_sync_session
from app.workers.retry import (
    load_retry_policy,
    move_to_dead_letter,
    schedule_retry,
    should_retry,
)

logger = logging.getLogger(__name__)

_RECOVERY_MESSAGE = "Recovered by reconciliation: worker timeout"
_CHANNEL_TASK_NAMES = {
    "email": "app.workers.email_worker.send_email",
    "sms": "app.workers.sms_worker.send_sms",
    "webhook": "app.workers.webhook_worker.send_webhook",
}


@celery_app.task(name="reconciliation.sweep", bind=True)
def reconcile_stuck_notifications(self) -> dict:
    """Sweep for stuck notifications and recover missed retries/zombie processing."""
    del self  # bound for future observability hooks

    session = get_sync_session()
    recovered_missed_retries = 0
    recovered_zombies = 0

    try:
        now = utc_now()

        # Recover missed retries: QUEUED + next_retry_at elapsed
        missed_retry_notifications = (
            session.execute(
                select(Notification).where(
                    col(Notification.status) == NotificationStatus.QUEUED,
                    Notification.next_retry_at.isnot(None),  # type: ignore[union-attr]
                    col(Notification.next_retry_at) <= now,
                )
            )
            .scalars()
            .all()
        )

        for notification in missed_retry_notifications:
            task_name = _CHANNEL_TASK_NAMES.get(str(notification.channel))
            if task_name is None:
                logger.warning(
                    "Reconciliation skipped notification %s with unknown channel %s",
                    notification.id,
                    notification.channel,
                )
                session.commit()
                continue

            celery_app.send_task(task_name, args=[str(notification.id)])
            logger.info(
                "Reconciliation re-enqueued missed retry notification %s to %s",
                notification.id,
                task_name,
            )
            recovered_missed_retries += 1
            session.commit()

        # Recover zombie processing: PROCESSING older than 5 minutes
        zombie_cutoff = utc_now() - timedelta(minutes=5)
        zombie_notifications = (
            session.execute(
                select(Notification).where(
                    col(Notification.status) == NotificationStatus.PROCESSING,
                    col(Notification.updated_at) < zombie_cutoff,
                )
            )
            .scalars()
            .all()
        )

        for notification in zombie_notifications:
            policy = load_retry_policy(session, str(notification.channel))
            task_name = _CHANNEL_TASK_NAMES.get(str(notification.channel))

            if policy and task_name and should_retry(notification, policy, "timeout"):
                countdown = schedule_retry(
                    session,
                    notification,
                    policy,
                    _RECOVERY_MESSAGE,
                    "timeout",
                )
                celery_app.send_task(task_name, args=[str(notification.id)], countdown=countdown)
                logger.info(
                    "Reconciliation recovered zombie notification %s with retry in %.1fs",
                    notification.id,
                    countdown,
                )
            elif policy:
                event_payload: dict = {}
                event = session.get(Event, str(notification.event_id))
                if event is not None:
                    event_payload = event.payload or {}
                move_to_dead_letter(
                    session,
                    notification,
                    event_payload,
                    _RECOVERY_MESSAGE,
                    "worker_timeout",
                )
                logger.warning(
                    "Reconciliation moved zombie notification %s to dead letter queue",
                    notification.id,
                )
            else:
                notification.status = NotificationStatus.FAILED
                notification.error_message = _RECOVERY_MESSAGE
                notification.failed_at = utc_now()
                notification.updated_at = utc_now()
                logger.warning(
                    "Reconciliation marked zombie notification %s as failed (no policy)",
                    notification.id,
                )

            recovered_zombies += 1
            session.commit()

        return {
            "status": "ok",
            "recovered_missed_retries": recovered_missed_retries,
            "recovered_zombies": recovered_zombies,
        }
    except Exception:
        session.rollback()
        logger.exception("Reconciliation sweep failed")
        raise
    finally:
        session.close()
