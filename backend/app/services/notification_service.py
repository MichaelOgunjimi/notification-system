"""Notification service — status management, querying, and delivery orchestration."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.schemas.notifications import NotificationListParams


async def get_notification(db: AsyncSession, notification_id: uuid.UUID) -> Notification | None:
    """Get a single notification by ID."""
    result = await db.execute(select(Notification).where(col(Notification.id) == notification_id))
    return result.scalar_one_or_none()


async def get_notification_logs(
    db: AsyncSession, notification_id: uuid.UUID
) -> list[NotificationLog]:
    """Get all log entries for a notification."""
    result = await db.execute(
        select(NotificationLog)
        .where(col(NotificationLog.notification_id) == notification_id)
        .order_by(col(NotificationLog.created_at))
    )
    return list(result.scalars().all())


async def list_notifications(
    db: AsyncSession,
    filters: NotificationListParams,
    page: int,
    per_page: int,
) -> tuple[list[Notification], int]:
    """Return filtered and paginated notifications."""
    query = select(Notification)
    count_query = select(func.count()).select_from(Notification)

    if filters.status is not None:
        query = query.where(col(Notification.status) == filters.status)
        count_query = count_query.where(col(Notification.status) == filters.status)
    if filters.channel is not None:
        query = query.where(col(Notification.channel) == filters.channel)
        count_query = count_query.where(col(Notification.channel) == filters.channel)
    if filters.date_from is not None:
        query = query.where(col(Notification.created_at) >= filters.date_from)
        count_query = count_query.where(col(Notification.created_at) >= filters.date_from)
    if filters.date_to is not None:
        query = query.where(col(Notification.created_at) <= filters.date_to)
        count_query = count_query.where(col(Notification.created_at) <= filters.date_to)
    if filters.recipient is not None:
        query = query.where(col(Notification.recipient_address) == filters.recipient)
        count_query = count_query.where(col(Notification.recipient_address) == filters.recipient)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * per_page
    query = query.order_by(col(Notification.created_at).desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    items = list(result.scalars().all())

    return items, total
