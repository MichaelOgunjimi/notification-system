"""Dead letter queue service — queries and actions for DLQ management.

All queries are scoped to the owning API key via:
  DeadLetterMessage → Notification → Event → api_key_id

This ensures strict cross-tenant isolation.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.dead_letter import DeadLetterMessage
from app.models.enums import (
    DeadLetterStatus,
    NotificationChannel,
    NotificationStatus,
)
from app.models.event import Event
from app.models.notification import Notification
from app.utils.datetime import utc_now
from app.workers.celery_app import celery_app

_CHANNEL_TASKS: dict[str, str] = {
    "email": "app.workers.email_worker.send_email",
    "sms": "app.workers.sms_worker.send_sms",
    "webhook": "app.workers.webhook_worker.send_webhook",
}


def _scoped_query(api_key_id: uuid.UUID):  # type: ignore[type-arg]
    """Base query scoped to the owning API key."""
    return (
        select(DeadLetterMessage)
        .join(
            Notification,
            col(DeadLetterMessage.notification_id) == col(Notification.id),
        )
        .join(Event, col(Notification.event_id) == col(Event.id))
        .where(col(Event.api_key_id) == api_key_id)
    )


async def list_dead_letters(
    db: AsyncSession,
    api_key_id: uuid.UUID,
    page: int,
    per_page: int,
    status: DeadLetterStatus | None = None,
    channel: NotificationChannel | None = None,
) -> tuple[list[DeadLetterMessage], int]:
    """List DLQ messages scoped to the API key, with optional filters."""
    query = _scoped_query(api_key_id)
    count_query = (
        select(func.count())
        .select_from(DeadLetterMessage)
        .join(
            Notification,
            col(DeadLetterMessage.notification_id) == col(Notification.id),
        )
        .join(Event, col(Notification.event_id) == col(Event.id))
        .where(col(Event.api_key_id) == api_key_id)
    )

    if status is not None:
        query = query.where(col(DeadLetterMessage.status) == status)
        count_query = count_query.where(col(DeadLetterMessage.status) == status)
    if channel is not None:
        query = query.where(col(DeadLetterMessage.channel) == channel)
        count_query = count_query.where(col(DeadLetterMessage.channel) == channel)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    query = query.order_by(col(DeadLetterMessage.failed_at).desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    items = list(result.scalars().all())

    return items, total


async def get_dead_letter(
    db: AsyncSession,
    dlq_id: uuid.UUID,
    api_key_id: uuid.UUID,
) -> DeadLetterMessage | None:
    """Get a single DLQ message by ID, scoped to the API key."""
    query = _scoped_query(api_key_id).where(col(DeadLetterMessage.id) == dlq_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def retry_dead_letter(
    db: AsyncSession,
    dlq_id: uuid.UUID,
    api_key_id: uuid.UUID,
) -> DeadLetterMessage | None:
    """Re-enqueue a DLQ message for delivery.

    Resets the notification to QUEUED with retry_count=0 and marks the
    DLQ record as RETRIED. Returns None if not found or not ACTIVE.
    """
    dlq = await get_dead_letter(db, dlq_id, api_key_id)
    if dlq is None:
        return None
    if dlq.status != DeadLetterStatus.ACTIVE:
        return None

    # Reset notification for re-delivery
    notification = await db.get(Notification, dlq.notification_id)
    if notification is not None:
        notification.status = NotificationStatus.QUEUED
        notification.retry_count = 0
        notification.next_retry_at = None
        notification.error_message = None
        notification.failed_at = None
        notification.updated_at = utc_now()

    # Mark DLQ record as retried
    now = utc_now()
    dlq.status = DeadLetterStatus.RETRIED
    dlq.retried_at = now
    dlq.updated_at = now
    await db.commit()

    # Re-enqueue to Celery
    if notification is not None:
        task_name = _CHANNEL_TASKS.get(str(notification.channel))
        if task_name:
            celery_app.send_task(task_name, args=[str(notification.id)])

    # Refresh to return updated state
    await db.refresh(dlq)
    return dlq


async def discard_dead_letter(
    db: AsyncSession,
    dlq_id: uuid.UUID,
    api_key_id: uuid.UUID,
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
