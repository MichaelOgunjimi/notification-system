"""Event service — business logic for event ingestion, validation, and fan-out."""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.enums import EventStatus, NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.schemas.events import EventCreate, RecipientCreate
from app.workers.queues import dispatcher_queue

logger = logging.getLogger(__name__)


def _resolve_recipient_address(recipient: RecipientCreate, channel: str) -> str:
    """Determine the delivery address for a given channel.

    Raises ValueError when the required contact field is missing.
    """
    if channel == "email":
        address = recipient.email
        if not address:
            raise ValueError(
                f"Recipient '{recipient.user_id or 'unknown'}' missing 'email' for email channel"
            )
        return address
    if channel == "sms":
        address = recipient.phone
        if not address:
            raise ValueError(
                f"Recipient '{recipient.user_id or 'unknown'}' missing 'phone' for sms channel"
            )
        return address
    if channel == "webhook":
        address = recipient.webhook_url
        if not address:
            raise ValueError(
                f"Recipient '{recipient.user_id or 'unknown'}' "
                "missing 'webhook_url' for webhook channel"
            )
        return address
    raise ValueError(f"Unsupported channel: {channel}")


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

            log_entry = NotificationLog(
                notification_id=notification.id,
                previous_status=None,
                new_status=NotificationStatus.PENDING,
            )
            db.add(log_entry)
            notification_ids.append(notification.id)

    await db.flush()

    if auto_commit:
        await db.commit()
        await db.refresh(event)
        _enqueue_dispatch(str(event.id), event_data.priority)
    return event, notification_ids


async def create_batch(
    db: AsyncSession,
    events_data: list[EventCreate],
    api_key_id: uuid.UUID,
) -> list[tuple[Event, list[uuid.UUID]]]:
    """Create multiple events atomically — all succeed or all roll back.

    DB operations are atomic (single commit). Enqueue is best-effort after
    commit — if enqueue fails for some events, the committed events are
    still returned so the client knows what was created.
    """
    batch_id = uuid.uuid4()
    results: list[tuple[Event, list[uuid.UUID]]] = []

    try:
        for event_data in events_data:
            event, notification_ids = await create_event(
                db,
                event_data,
                api_key_id,
                batch_id=batch_id,
                auto_commit=False,
            )
            results.append((event, notification_ids))
        await db.commit()
    except ValueError:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    # Best-effort enqueue after commit — failures logged, not raised
    for event, _ in results:
        try:
            _enqueue_dispatch(str(event.id), event.priority)
        except Exception:
            logger.error(
                "Failed to enqueue event %s — stuck in ACCEPTED, needs reprocessing",
                event.id,
            )

    return results


def _enqueue_dispatch(event_id: str, priority: str) -> None:
    """Enqueue event dispatch to the appropriate priority queue.

    Raises on failure so the caller knows the event won't be processed.
    """
    from app.workers.dispatcher import dispatch_event

    dispatch_event.apply_async(args=[event_id], queue=dispatcher_queue(priority))


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
