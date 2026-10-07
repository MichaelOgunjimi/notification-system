"""Celery beat task — picks up due scheduled events and dispatches them.

Each due row is handled in its own transaction: lock the row, create the real
Event (reusing ``create_event`` so scheduled and immediate events share one
path), and mark the row DISPATCHED with ``event_id`` — all committed together.
A crash before the commit rolls everything back and the row stays PENDING for
the next sweep; a crash after it leaves a committed Event and a DISPATCHED row.
The Celery enqueue happens only after the commit, as in ``POST /events``.

``create_event`` is async while Celery tasks are sync, so the task bridges with
``asyncio.run`` and a throwaway engine (same approach as the lifecycle
notification worker). That keeps one implementation of template resolution,
fan-out and idempotency instead of a sync twin that would drift.
"""

import asyncio
import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta

from celery import shared_task
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import col

from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.events import idempotency as idempotency_service
from app.modules.events.enums import EventStatus, ScheduledEventStatus
from app.modules.events.schemas import EventCreate
from app.modules.events.service import _enqueue_dispatch, create_event

logger = logging.getLogger(__name__)

GRACE_PERIOD = timedelta(hours=1)
SWEEP_LIMIT = 100

SessionFactory = Callable[[], AsyncSession]
Enqueue = Callable[[str, str], None]


@dataclass
class SweepResult:
    dispatched: int = 0
    expired: int = 0
    failed: int = 0
    retry: int = 0


def idempotency_key_for(scheduled_id: uuid.UUID) -> str:
    """Key that makes a scheduled event produce at most one Event, however often retried."""
    return f"scheduled:{scheduled_id}"


async def dispatch_due_events(
    session_factory: SessionFactory,
    *,
    now: datetime | None = None,
    enqueue: Enqueue = _enqueue_dispatch,
) -> SweepResult:
    """Dispatch up to ``SWEEP_LIMIT`` due PENDING rows, oldest first."""
    from app.modules.events.scheduled.model import ScheduledEvent

    now = now or utc_now()
    async with session_factory() as db:
        due_ids = list(
            (
                await db.execute(
                    select(col(ScheduledEvent.id))
                    .where(
                        col(ScheduledEvent.status) == ScheduledEventStatus.PENDING,
                        col(ScheduledEvent.scheduled_for) <= now,
                    )
                    .order_by(col(ScheduledEvent.scheduled_for).asc())
                    .limit(SWEEP_LIMIT)
                )
            )
            .scalars()
            .all()
        )

    result = SweepResult()
    for scheduled_id in due_ids:
        outcome = await _dispatch_one(session_factory, scheduled_id, now, enqueue)
        if outcome is not None:
            setattr(result, outcome, getattr(result, outcome) + 1)
    return result


async def _dispatch_one(
    session_factory: SessionFactory,
    scheduled_id: uuid.UUID,
    now: datetime,
    enqueue: Enqueue,
) -> str | None:
    """Process one row; returns the SweepResult field it counts toward (None if skipped)."""
    from app.modules.events.scheduled.model import ScheduledEvent

    async with session_factory() as db:
        # SKIP LOCKED: another sweep (or a cancel in flight) owns this row.
        scheduled = (
            await db.execute(
                select(ScheduledEvent)
                .where(
                    col(ScheduledEvent.id) == scheduled_id,
                    col(ScheduledEvent.status) == ScheduledEventStatus.PENDING,
                )
                .with_for_update(skip_locked=True)
            )
        ).scalar_one_or_none()
        if scheduled is None:
            return None

        if scheduled.scheduled_for < now - GRACE_PERIOD:
            logger.warning(
                "Scheduled event %s missed grace window (scheduled_for=%s), marking EXPIRED",
                scheduled.id,
                scheduled.scheduled_for,
            )
            scheduled.status = ScheduledEventStatus.EXPIRED
            scheduled.failure_reason = (
                f"Not dispatched within {int(GRACE_PERIOD.total_seconds() // 60)} minutes "
                "of scheduled_for"
            )
            scheduled.updated_at = utc_now()
            await db.commit()
            return "expired"

        try:
            idempotency_key = idempotency_key_for(scheduled.id)
            event_data = EventCreate.model_validate(
                {
                    **scheduled.payload,
                    "priority": scheduled.priority,
                    "idempotency_key": idempotency_key,
                }
            )
            event, _notification_ids, is_duplicate = await create_event(
                db, event_data, scheduled.api_key_id, auto_commit=False
            )
        except (ValueError, ValidationError) as exc:
            # Permanent: the content can never be delivered (template deleted since
            # scheduling, bad recipient). Retrying would only fail again.
            await db.rollback()
            logger.error("Scheduled event %s cannot be dispatched: %s", scheduled_id, exc)
            await _mark_failed(db, scheduled_id, _describe(exc))
            return "failed"
        except Exception:
            # Transient (database, etc.): leave PENDING so the next sweep retries,
            # until the grace window runs out and the row expires.
            await db.rollback()
            logger.exception("Scheduled event %s failed to dispatch; will retry", scheduled_id)
            return "retry"

        scheduled.event_id = event.id
        scheduled.status = ScheduledEventStatus.DISPATCHED
        scheduled.updated_at = utc_now()
        await db.commit()

    # After the commit, mirroring POST /events. A duplicate means a committed Event
    # already exists for this key; only nudge it if it never started processing.
    if not is_duplicate:
        await idempotency_service.store(scheduled.api_key_id, idempotency_key, event.id)
    if not is_duplicate or event.status == EventStatus.ACCEPTED:
        try:
            enqueue(str(event.id), str(event_data.priority))
        except Exception:
            logger.critical(
                "Scheduled event %s created event %s but enqueue failed; "
                "event is stuck in ACCEPTED and needs reprocessing",
                scheduled_id,
                event.id,
            )
    return "dispatched"


def _describe(exc: ValueError | ValidationError) -> str:
    """One readable line for the row; pydantic's multi-line report is trimmed to field: message."""
    if isinstance(exc, ValidationError):
        text = "; ".join(
            f"{'.'.join(str(part) for part in err['loc']) or 'payload'}: {err['msg']}"
            for err in exc.errors()
        )
    else:
        text = str(exc)
    return text[:500]


async def _mark_failed(db: AsyncSession, scheduled_id: uuid.UUID, reason: str) -> None:
    from app.modules.events.scheduled.model import ScheduledEvent

    scheduled = await db.get(ScheduledEvent, scheduled_id, with_for_update=True)
    if scheduled is not None and scheduled.status == ScheduledEventStatus.PENDING:
        scheduled.status = ScheduledEventStatus.FAILED
        scheduled.failure_reason = reason
        scheduled.updated_at = utc_now()
    await db.commit()


async def _run_sweep() -> SweepResult:
    # Fresh engine per run: asyncio.run gives each sweep its own event loop and
    # asyncpg connections cannot outlive the loop that opened them.
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        return await dispatch_due_events(factory)
    finally:
        await engine.dispose()


@shared_task(name="workers.dispatch_scheduled_events")
def dispatch_scheduled_events() -> dict[str, int]:
    """Find all pending scheduled events due now and convert them to real events."""
    result = asyncio.run(_run_sweep())
    if result != SweepResult():
        logger.info("Scheduled event sweep: %s", result)
    return {
        "dispatched": result.dispatched,
        "expired": result.expired,
        "failed": result.failed,
        "retry": result.retry,
    }
