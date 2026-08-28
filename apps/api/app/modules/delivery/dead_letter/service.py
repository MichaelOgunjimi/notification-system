"""Dead letter queue service — queries and actions for DLQ management.

All queries are scoped to the owning API key via:
  DeadLetterMessage → Notification → Event → api_key_id

This ensures strict cross-tenant isolation.
"""

import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.datetime import utc_now
from app.modules.delivery.dead_letter.model import DeadLetterMessage
from app.modules.delivery.enums import DeadLetterStatus
from app.modules.delivery.processing.queues import channel_queue
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.notifications.model import Notification
from app.workers.celery_app import celery_app

_CHANNEL_TASKS: dict[str, str] = {
    "email": "app.workers.email_worker.send_email",
    "sms": "app.workers.sms_worker.send_sms",
    "webhook": "app.workers.webhook_worker.send_webhook",
}


def _scoped_query(api_key_id: uuid.UUID | None):
    """Base query scoped to the owning API key or unscoped for platform operations."""
    q = (
        select(DeadLetterMessage)
        .join(
            Notification,
            col(DeadLetterMessage.notification_id) == col(Notification.id),
        )
        .join(Event, col(Notification.event_id) == col(Event.id))
    )
    if api_key_id is not None:
        q = q.where(col(Event.api_key_id) == api_key_id)
    return q


async def list_dead_letters(
    db: AsyncSession,
    api_key_id: uuid.UUID | None,
    page: int,
    per_page: int,
    status: DeadLetterStatus | None = None,
    channel: NotificationChannel | None = None,
) -> tuple[list[DeadLetterMessage], int]:
    """List DLQ messages scoped to the API key or all for platform operations."""
    query = _scoped_query(api_key_id)
    count_q = (
        select(func.count())
        .select_from(DeadLetterMessage)
        .join(
            Notification,
            col(DeadLetterMessage.notification_id) == col(Notification.id),
        )
        .join(Event, col(Notification.event_id) == col(Event.id))
    )
    if api_key_id is not None:
        count_q = count_q.where(col(Event.api_key_id) == api_key_id)

    if status is not None:
        query = query.where(col(DeadLetterMessage.status) == status)
        count_q = count_q.where(col(DeadLetterMessage.status) == status)
    if channel is not None:
        query = query.where(col(DeadLetterMessage.channel) == channel)
        count_q = count_q.where(col(DeadLetterMessage.channel) == channel)

    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    query = query.order_by(col(DeadLetterMessage.failed_at).desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    items = list(result.scalars().all())

    return items, total


async def get_dead_letter(
    db: AsyncSession,
    dlq_id: uuid.UUID,
    api_key_id: uuid.UUID | None,
) -> DeadLetterMessage | None:
    """Get a single DLQ message by ID, scoped to the API key."""
    query = _scoped_query(api_key_id).where(col(DeadLetterMessage.id) == dlq_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def retry_dead_letter(
    db: AsyncSession,
    dlq_id: uuid.UUID,
    api_key_id: uuid.UUID | None,
) -> DeadLetterMessage | None:
    """Re-enqueue a DLQ message for delivery.

    Resets the notification to QUEUED with retry_count=0 and marks the
    DLQ record as RETRIED. Returns None if not found or not ACTIVE.
    """
    # SELECT FOR UPDATE to prevent concurrent retries of the same record
    query = _scoped_query(api_key_id).where(col(DeadLetterMessage.id) == dlq_id).with_for_update()
    result = await db.execute(query)
    dlq = result.scalar_one_or_none()
    if dlq is None:
        return None
    if dlq.status != DeadLetterStatus.ACTIVE:
        return None

    # Reset notification for re-delivery
    notification = await db.get(Notification, dlq.notification_id)
    if notification is not None:
        notification.status = NotificationStatus.QUEUED
        notification.retry_count = 0
        # Safety net: set next_retry_at so reconciliation can recover if enqueue fails
        notification.next_retry_at = utc_now() + timedelta(minutes=2)
        notification.error_message = None
        notification.failed_at = None
        notification.updated_at = utc_now()

    # Mark DLQ record as retried
    now = utc_now()
    dlq.status = DeadLetterStatus.RETRIED
    dlq.retried_at = now
    dlq.updated_at = now
    await db.commit()

    # Re-enqueue to the correct channel queue
    if notification is not None:
        task_name = _CHANNEL_TASKS.get(str(notification.channel))
        if task_name:
            q = channel_queue(str(notification.channel), str(notification.priority))
            celery_app.send_task(task_name, args=[str(notification.id)], queue=q)
            # Clear safety net now that enqueue succeeded
            notification.next_retry_at = None
            await db.commit()

    # Refresh to return updated state
    await db.refresh(dlq)
    return dlq  # type: ignore[no-any-return]


async def discard_dead_letter(
    db: AsyncSession,
    dlq_id: uuid.UUID,
    api_key_id: uuid.UUID | None,
) -> DeadLetterMessage | None:
    """Mark a DLQ message as discarded (acknowledged, won't retry).

    Returns None if not found or not ACTIVE.
    """
    dlq = await get_dead_letter(db, dlq_id, api_key_id)
    if dlq is None:
        return None
    if dlq.status != DeadLetterStatus.ACTIVE:
        return None

    now = utc_now()
    dlq.status = DeadLetterStatus.DISCARDED
    dlq.discarded_at = now
    dlq.updated_at = now
    await db.commit()
    await db.refresh(dlq)
    return dlq
