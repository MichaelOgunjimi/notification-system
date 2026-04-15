"""Celery beat task — picks up due scheduled events and dispatches them."""

import logging

from celery import shared_task
from sqlalchemy import select
from sqlmodel import col

from app.models.enums import ScheduledEventStatus
from app.utils.datetime import utc_now
from app.workers.database import get_sync_session

logger = logging.getLogger(__name__)


@shared_task(name="workers.dispatch_scheduled_events")
def dispatch_scheduled_events() -> None:
    """Find all pending scheduled events due now and convert them to real events."""
    from app.models.scheduled_event import ScheduledEvent

    with get_sync_session() as db:
        now = utc_now()
        rows = (
            db.execute(
                select(ScheduledEvent)
                .where(
                    col(ScheduledEvent.status) == ScheduledEventStatus.PENDING,
                    col(ScheduledEvent.scheduled_for) <= now,
                )
                .order_by(col(ScheduledEvent.scheduled_for).asc())
                .limit(100)
                .with_for_update(skip_locked=True)
            )
            .scalars()
            .all()
        )

        for scheduled in rows:
            scheduled.status = ScheduledEventStatus.PROCESSING
            db.flush()
            try:
                logger.info("Dispatching scheduled event %s", scheduled.id)
                # Phase 7 placeholder: mark as dispatched.
                # Full event creation/dispatch wiring lands in the next phase.
                scheduled.status = ScheduledEventStatus.DISPATCHED
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.exception("Failed to dispatch scheduled event %s: %s", scheduled.id, exc)
                scheduled.status = ScheduledEventStatus.FAILED
            db.flush()
        db.commit()
