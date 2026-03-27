"""Event service — business logic for event ingestion, validation, and fan-out."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.enums import EventStatus, NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.schemas.events import EventCreate, RecipientCreate


def _resolve_recipient_address(recipient: RecipientCreate, channel: str) -> str:
    """Determine the delivery address for a given channel."""
    if channel == "email":
        return recipient.email or recipient.user_id or ""
    if channel == "sms":
        return recipient.phone or recipient.user_id or ""
    if channel == "webhook":
        return recipient.webhook_url or ""
    return recipient.user_id or ""


async def create_event(
    db: AsyncSession,
    event_data: EventCreate,
    api_key_id: uuid.UUID,
    *,
    batch_id: uuid.UUID | None = None,
    auto_commit: bool = True,
) -> tuple[Event, list[uuid.UUID]]:
    """Create an Event and fan out Notification records for each recipient+channel.

    When ``auto_commit`` is False the caller is responsible for committing
    (or rolling back) the transaction — used by the batch endpoint so that
    all events in a batch are atomic.
    """
    event = Event(
        event_type=event_data.event_type,
        priority=event_data.priority,
        status=EventStatus.ACCEPTED,
        template_id=event_data.template_id,
        payload=event_data.payload,
        metadata_=event_data.metadata,
        api_key_id=api_key_id,
        batch_id=batch_id,
        recipient_count=len(event_data.recipients),
    )
    db.add(event)
    await db.flush()

    notification_ids: list[uuid.UUID] = []

    for recipient in event_data.recipients:
        for channel in recipient.channels:
            address = _resolve_recipient_address(recipient, channel)
            notification = Notification(
                event_id=event.id,
                channel=channel,
                status=NotificationStatus.PENDING,
                priority=event_data.priority,
                recipient_user_id=recipient.user_id or "",
                recipient_address=address,
                webhook_secret=None,
            )
            db.add(notification)
            await db.flush()

            log_entry = NotificationLog(
                notification_id=notification.id,
                previous_status=None,
                new_status=NotificationStatus.PENDING,
            )
            db.add(log_entry)
            notification_ids.append(notification.id)

    if auto_commit:
        await db.commit()
        await db.refresh(event)
    return event, notification_ids


async def get_event(
    db: AsyncSession, event_id: uuid.UUID, api_key_id: uuid.UUID | None = None
) -> Event | None:
    """Fetch a single event by ID, scoped to the owning API key."""
    query = select(Event).where(col(Event.id) == event_id)
    if api_key_id is not None:
        query = query.where(col(Event.api_key_id) == api_key_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_event_notification_ids(db: AsyncSession, event_id: uuid.UUID) -> list[uuid.UUID]:
    """Get all notification IDs for an event."""
    result = await db.execute(
        select(col(Notification.id)).where(col(Notification.event_id) == event_id)
    )
    return list(result.scalars().all())
