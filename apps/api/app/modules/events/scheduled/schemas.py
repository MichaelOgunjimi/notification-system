"""Scheduled event schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.core.datetime import to_naive_utc, utc_now
from app.modules.events.enums import EventPriority, ScheduledEventStatus
from app.modules.events.schemas import EventContent


class ScheduledEventCreate(EventContent):
    """Same content fields as ``EventCreate`` plus the delivery time.

    There is no ``idempotency_key``: the dispatcher derives one from the
    scheduled event's id.
    """

    scheduled_for: datetime

    @field_validator("scheduled_for")
    @classmethod
    def must_be_future(cls, v: datetime) -> datetime:
        """Normalize to naive UTC (the column type) so offset-aware input compares safely."""
        v = to_naive_utc(v)
        if v <= utc_now():
            raise ValueError("scheduled_for must be a future datetime")
        return v


class ScheduledEventResponse(BaseModel):
    id: uuid.UUID
    api_key_id: uuid.UUID
    event_type: str
    scheduled_for: datetime
    priority: EventPriority
    status: ScheduledEventStatus
    event_id: uuid.UUID | None
    failure_reason: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
