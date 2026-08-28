"""Event service — business logic for event ingestion, validation, and fan-out."""

import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.datetime import to_naive_utc
from app.modules.delivery.processing.queues import dispatcher_queue
from app.modules.events import idempotency as idempotency_service
from app.modules.events.enums import EventPriority, EventStatus
from app.modules.events.model import Event
from app.modules.events.schemas import EventCreate, RecipientCreate
from app.modules.notifications.enums import NotificationStatus
from app.modules.notifications.log_model import NotificationLog
from app.modules.notifications.model import Notification
from app.modules.templates.model import Template

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
) -> tuple[Event, list[uuid.UUID], bool]:
    """Create an Event and fan out Notification records for each recipient+channel.

    Returns ``(event, notification_ids, is_duplicate)``.  When ``is_duplicate``
    is True the event already existed and was not re-created — callers should
    return HTTP 200 instead of 202.

    When ``auto_commit`` is False the caller is responsible for committing
    (or rolling back) the transaction — used by the batch endpoint so that
    all events in a batch are atomic.
    """
    # --- Resolve template_name → template_id (template_id takes priority if both given) ---
    resolved_template_id = event_data.template_id
    if resolved_template_id is None and event_data.template_name:
        result = await db.execute(
            select(Template).where(col(Template.name) == event_data.template_name)
        )
        tpl = result.scalars().first()
        resolved_template_id = tpl.id if tpl is not None else None
        if resolved_template_id is None:
            raise ValueError(f"Template with name '{event_data.template_name}' not found")

    # --- Idempotency check ---
    if event_data.idempotency_key:
        existing = await idempotency_service.check(db, api_key_id, event_data.idempotency_key)
        if existing is not None:
            existing_notification_ids = await get_event_notification_ids(db, existing.id)
            return existing, existing_notification_ids, True
    event = Event(
        event_type=event_data.event_type,
        priority=event_data.priority,
        status=EventStatus.ACCEPTED,
        template_id=resolved_template_id,
        payload=event_data.payload,
        metadata_=event_data.metadata,
        api_key_id=api_key_id,
        batch_id=batch_id,
        idempotency_key=event_data.idempotency_key,
        recipient_count=len(event_data.recipients),
    )
    db.add(event)
    try:
        async with db.begin_nested():
            await db.flush()
    except IntegrityError:
        # Concurrent request won the race on the unique (api_key_id, idempotency_key) index.
        # The savepoint was rolled back — re-fetch the winner's event and return it.
        if event_data.idempotency_key:
            existing = await idempotency_service.check(db, api_key_id, event_data.idempotency_key)
            if existing is not None:
                existing_notification_ids = await get_event_notification_ids(db, existing.id)
                return existing, existing_notification_ids, True
        raise  # Unrelated integrity error — let it propagate

    notification_ids: list[uuid.UUID] = []
    notification_logs: list[NotificationLog] = []

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
            notification_ids.append(notification.id)
            notification_logs.append(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=None,
                    new_status=NotificationStatus.PENDING,
                )
            )

    # Persist parent notifications before their immutable status logs. These
    # models deliberately have no ORM relationship, so the explicit boundary
    # makes the foreign-key ordering independent of mapper import order.
    await db.flush()
    db.add_all(notification_logs)
    await db.flush()

    if auto_commit:
        await db.commit()
        await db.refresh(event)
        if event_data.idempotency_key:
            await idempotency_service.store(api_key_id, event_data.idempotency_key, event.id)
        _enqueue_dispatch(str(event.id), event_data.priority)
    return event, notification_ids, False


async def create_batch(
    db: AsyncSession,
    events_data: list[EventCreate],
    api_key_id: uuid.UUID,
) -> list[tuple[Event, list[uuid.UUID]]]:
    """Create multiple events atomically — all succeed or all roll back.

    DB operations are atomic (single commit). Enqueue is best-effort after
    commit — if enqueue fails for some events, the committed events are
    still returned so the client knows what was created.

    Idempotency keys within a batch are checked individually. Duplicate
    events in the batch return their existing records without re-creating.
    """
    batch_id = uuid.uuid4()
    results: list[tuple[Event, list[uuid.UUID]]] = []
    new_events: list[tuple[Event, str]] = []  # (event, priority) for post-commit enqueue
    new_idempotency: list[tuple[str, uuid.UUID]] = []  # (key, event_id) for post-commit cache

    try:
        for event_data in events_data:
            event, notification_ids, is_duplicate = await create_event(
                db,
                event_data,
                api_key_id,
                batch_id=batch_id,
                auto_commit=False,
            )
            results.append((event, notification_ids))
            if not is_duplicate:
                new_events.append((event, str(event_data.priority)))
                if event_data.idempotency_key:
                    new_idempotency.append((event_data.idempotency_key, event.id))
        await db.commit()
    except ValueError:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    # Cache idempotency keys for newly created events only (duplicates were already
    # backfilled by idempotency_service.check() when they were detected).
    for key, event_id in new_idempotency:
        await idempotency_service.store(api_key_id, key, event_id)

    enqueue_failures = 0
    for event, priority in new_events:
        try:
            _enqueue_dispatch(str(event.id), priority)
        except Exception:
            enqueue_failures += 1
            logger.error(
                "Failed to enqueue event %s — stuck in ACCEPTED, needs reprocessing",
                event.id,
            )
    if enqueue_failures:
        logger.critical(
            "%d/%d events failed to enqueue — reconciliation worker will retry",
            enqueue_failures,
            len(new_events),
        )

    return results


def _enqueue_dispatch(event_id: str, priority: str) -> None:
    """Enqueue event dispatch to the appropriate priority queue.

    Raises on failure so the caller knows the event won't be processed.
    """
    from app.modules.delivery.processing.dispatcher import dispatch_event

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


async def event_has_failures(db: AsyncSession, event_id: uuid.UUID) -> bool:
    """Return True if any notification for this event is in failed/dead-letter state."""
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(
            col(Notification.event_id) == event_id,
            col(Notification.status).in_(
                [NotificationStatus.FAILED, NotificationStatus.DEAD_LETTER]
            ),
        )
    )
    return int(result.scalar() or 0) > 0


async def bulk_has_failures(db: AsyncSession, event_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Return the set of event IDs that have at least one failed/dead-letter notification.

    Single query for the whole page — avoids N+1 in list_events.
    """
    if not event_ids:
        return set()
    result = await db.execute(
        select(col(Notification.event_id))
        .where(
            col(Notification.event_id).in_(event_ids),
            col(Notification.status).in_(
                [NotificationStatus.FAILED, NotificationStatus.DEAD_LETTER]
            ),
        )
        .distinct()
    )
    return set(result.scalars().all())


async def list_events(
    db: AsyncSession,
    api_key_id: uuid.UUID | None,
    *,
    status: EventStatus | None = None,
    priority: EventPriority | None = None,
    event_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Event], int]:
    """List events scoped to an API key, or unscoped for platform operations."""
    query = select(Event)
    if api_key_id is not None:
        query = query.where(col(Event.api_key_id) == api_key_id)
    if status is not None:
        query = query.where(col(Event.status) == status)
    if priority is not None:
        query = query.where(col(Event.priority) == priority)
    if event_type is not None:
        # Escape LIKE wildcards in user input before substring search
        escaped = event_type.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(col(Event.event_type).ilike(f"%{escaped}%", escape="\\"))
    if date_from is not None:
        query = query.where(col(Event.created_at) >= to_naive_utc(date_from))
    if date_to is not None:
        query = query.where(col(Event.created_at) <= to_naive_utc(date_to))
    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = int(total_result.scalar() or 0)
    offset = (page - 1) * per_page
    result = await db.execute(
        query.order_by(col(Event.created_at).desc()).offset(offset).limit(per_page)
    )
    return list(result.scalars().all()), total


async def get_event_notifications(db: AsyncSession, event_id: uuid.UUID) -> list[Notification]:
    """Fetch all Notification rows for an event, ordered by creation time."""
    result = await db.execute(
        select(Notification)
        .where(col(Notification.event_id) == event_id)
        .order_by(col(Notification.created_at).asc())
    )
    return list(result.scalars().all())
