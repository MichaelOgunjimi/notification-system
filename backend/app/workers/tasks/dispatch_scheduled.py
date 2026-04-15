"""Celery beat task — picks up due scheduled events and dispatches them."""

import logging
from datetime import timedelta

from celery import shared_task
from sqlalchemy import select
from sqlmodel import col

from app.models.enums import ScheduledEventStatus
from app.utils.datetime import utc_now
from app.workers.database import get_sync_session

logger = logging.getLogger(__name__)
GRACE_PERIOD = timedelta(hours=1)


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
                if scheduled.scheduled_for < now - GRACE_PERIOD:
                    logger.warning(
                        (
                            "Scheduled event %s missed grace window (scheduled_for=%s), "
                            "marking EXPIRED"
                        ),
                        scheduled.id,
                        scheduled.scheduled_for,
                    )
                    scheduled.status = ScheduledEventStatus.EXPIRED
                else:
                    # Full event creation/dispatch wiring lands in the next phase.
                    # Mark FAILED so the row remains visible and recoverable rather
                    # than silently disappearing as DISPATCHED without any delivery.
                    logger.warning(
                        "Scheduled event %s is due but dispatch is not yet implemented; "
                        "marking FAILED for manual recovery",
                        scheduled.id,
                    )
                    scheduled.status = ScheduledEventStatus.FAILED
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.exception("Failed to dispatch scheduled event %s: %s", scheduled.id, exc)
                scheduled.status = ScheduledEventStatus.FAILED
            db.flush()
        db.commit()
