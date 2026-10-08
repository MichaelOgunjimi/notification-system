"""The status a scheduled event is shown with, and the SQL that selects it.

A stored ``dispatched`` row only says an Event was created; the linked Event says
whether delivery then finished. The dashboard shows (and filters by) that derived
status, so the label, the filter clause and the response field all come from here and a
filter chip can never contain rows labelled differently.
"""

from enum import StrEnum
from typing import Any

from sqlalchemy import and_, or_
from sqlmodel import col

from app.modules.events.enums import EventStatus, ScheduledEventStatus
from app.modules.events.model import Event
from app.modules.events.scheduled.model import ScheduledEvent


class ScheduledDisplayStatus(StrEnum):
    PENDING = "pending"
    DISPATCHED = "dispatched"
    COMPLETED = "completed"
    PARTIALLY_FAILED = "partially_failed"
    DELIVERY_FAILED = "delivery_failed"
    FAILED = "failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


# Dispatched rows whose delivery has reached an outcome, and the status that shows it.
_OUTCOMES = {
    EventStatus.COMPLETED: ScheduledDisplayStatus.COMPLETED,
    EventStatus.PARTIALLY_FAILED: ScheduledDisplayStatus.PARTIALLY_FAILED,
    EventStatus.FAILED: ScheduledDisplayStatus.DELIVERY_FAILED,
}


def display_status(
    status: ScheduledEventStatus, event_status: EventStatus | None
) -> ScheduledDisplayStatus:
    """The status to show. ``processing`` is reserved and never produced, so it reads as pending."""
    if status in (ScheduledEventStatus.PENDING, ScheduledEventStatus.PROCESSING):
        return ScheduledDisplayStatus.PENDING
    if status == ScheduledEventStatus.DISPATCHED:
        return _OUTCOMES.get(event_status, ScheduledDisplayStatus.DISPATCHED)  # type: ignore[arg-type]
    return ScheduledDisplayStatus(status.value)


def display_status_clause(display: ScheduledDisplayStatus) -> Any:
    """SQL predicate matching rows that :func:`display_status` labels ``display``.

    Expects ``ScheduledEvent`` outer-joined to ``Event`` on ``event_id``.
    """
    stored = col(ScheduledEvent.status)
    event = col(Event.status)
    if display == ScheduledDisplayStatus.PENDING:
        return stored.in_([ScheduledEventStatus.PENDING, ScheduledEventStatus.PROCESSING])
    if display == ScheduledDisplayStatus.DISPATCHED:
        return and_(
            stored == ScheduledEventStatus.DISPATCHED,
            or_(event.is_(None), event.notin_(list(_OUTCOMES))),
        )
    for outcome_status, outcome_display in _OUTCOMES.items():
        if display == outcome_display:
            return and_(stored == ScheduledEventStatus.DISPATCHED, event == outcome_status)
    return stored == ScheduledEventStatus(display.value)
