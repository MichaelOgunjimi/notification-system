"""Notification service — status management, querying, and delivery orchestration."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.schemas.notifications import NotificationListParams
from app.utils.datetime import to_naive_utc


async def get_notification(
    db: AsyncSession, notification_id: uuid.UUID, api_key_id: uuid.UUID | None = None
) -> Notification | None:
    """Get a single notification by ID, scoped to the owning API key via Event."""
    query = select(Notification).where(col(Notification.id) == notification_id)
    if api_key_id is not None:
        query = query.join(Event, col(Notification.event_id) == col(Event.id)).where(
            col(Event.api_key_id) == api_key_id
        )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_notification_logs(
    db: AsyncSession, notification_id: uuid.UUID, api_key_id: uuid.UUID | None = None
) -> list[NotificationLog]:
    """Get all log entries for a notification, scoped to owning API key."""
    query = (
        select(NotificationLog)
        .where(col(NotificationLog.notification_id) == notification_id)
        .order_by(col(NotificationLog.created_at))
    )
    if api_key_id is not None:
        query = (
            query.join(Notification, col(NotificationLog.notification_id) == col(Notification.id))
            .join(Event, col(Notification.event_id) == col(Event.id))
            .where(col(Event.api_key_id) == api_key_id)
        )
    result = await db.execute(query)
    return list(result.scalars().all())


async def list_notifications(
    db: AsyncSession,
    filters: NotificationListParams,
    page: int,
    per_page: int,
    api_key_id: uuid.UUID | None = None,
) -> tuple[list[Notification], int]:
    """Return filtered and paginated notifications, scoped to the owning API key."""
    query = select(Notification)
    count_query = select(func.count()).select_from(Notification)

    if api_key_id is not None:
        query = query.join(Event, col(Notification.event_id) == col(Event.id)).where(
            col(Event.api_key_id) == api_key_id
        )
        count_query = count_query.join(Event, col(Notification.event_id) == col(Event.id)).where(
            col(Event.api_key_id) == api_key_id
        )

    if filters.status is not None:
        query = query.where(col(Notification.status) == filters.status)
        count_query = count_query.where(col(Notification.status) == filters.status)
    if filters.channel is not None:
        query = query.where(col(Notification.channel) == filters.channel)
        count_query = count_query.where(col(Notification.channel) == filters.channel)
    if filters.date_from is not None:
        _from = to_naive_utc(filters.date_from)
        query = query.where(col(Notification.created_at) >= _from)
        count_query = count_query.where(col(Notification.created_at) >= _from)
    if filters.date_to is not None:
        _to = to_naive_utc(filters.date_to)
        query = query.where(col(Notification.created_at) <= _to)
        count_query = count_query.where(col(Notification.created_at) <= _to)
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
