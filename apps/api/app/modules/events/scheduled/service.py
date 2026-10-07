"""Scheduled event service — create, list, cancel scheduled events."""

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func, select

from app.core.datetime import utc_now
from app.modules.events.enums import ScheduledEventStatus
from app.modules.events.scheduled.model import ScheduledEvent
from app.modules.events.scheduled.schemas import ScheduledEventCreate
from app.modules.events.service import resolve_content_template, validate_recipient_addresses


async def create_scheduled_event(
    db: AsyncSession,
    data: ScheduledEventCreate,
    api_key_id: uuid.UUID,
) -> ScheduledEvent:
    """Store an event for later delivery.

    Raises ValueError for problems the dispatcher would hit anyway (a recipient
    missing the contact field for a channel, an unknown ``template_name``) so
    the caller learns now rather than from a FAILED row later. The full
    ``EventCreate`` shape is persisted so dispatch can replay it unchanged.
    """
    validate_recipient_addresses(data.recipients)
    await resolve_content_template(db, data, api_key_id)
    event = ScheduledEvent(
        api_key_id=api_key_id,
        payload=data.model_dump(mode="json", exclude={"scheduled_for", "priority"}),
        scheduled_for=data.scheduled_for,
        priority=data.priority,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


async def list_scheduled_events(
    db: AsyncSession,
    api_key_id: uuid.UUID | None,
    *,
    status: ScheduledEventStatus | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[ScheduledEvent], int]:
    query = select(ScheduledEvent)
    if api_key_id is not None:
        query = query.where(col(ScheduledEvent.api_key_id) == api_key_id)
    if status is not None:
        query = query.where(col(ScheduledEvent.status) == status)
    total = int(
        (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    )
    offset = (page - 1) * per_page
    rows = (
        (
            await db.execute(
                query.order_by(col(ScheduledEvent.scheduled_for).asc())
                .offset(offset)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )
    return list(rows), total


async def cancel_scheduled_event(
    db: AsyncSession,
    event_id: uuid.UUID,
    api_key_id: uuid.UUID | None,
) -> ScheduledEvent | None:
    result = await db.execute(
        select(ScheduledEvent).where(col(ScheduledEvent.id) == event_id).with_for_update()
    )
    event = result.scalar_one_or_none()
    if event is None:
        return None
    if api_key_id is not None and event.api_key_id != api_key_id:
        return None
    if event.status != ScheduledEventStatus.PENDING:
        return event
    event.status = ScheduledEventStatus.CANCELLED
    event.updated_at = utc_now()
    await db.commit()
    await db.refresh(event)
    return event


async def get_pending_due(
    db: AsyncSession,
    now: datetime,
    limit: int = 100,
) -> list[ScheduledEvent]:
    """Fetch pending scheduled events whose scheduled_for <= now. Used by Celery beat."""
    result = await db.execute(
        select(ScheduledEvent)
        .where(
            col(ScheduledEvent.status) == ScheduledEventStatus.PENDING,
            col(ScheduledEvent.scheduled_for) <= now,
        )
        .order_by(col(ScheduledEvent.scheduled_for).asc())
        .limit(limit)
    )
    return list(result.scalars().all())
