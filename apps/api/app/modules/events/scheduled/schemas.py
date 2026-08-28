"""Scheduled event schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.core.datetime import utc_now
from app.modules.events.enums import EventPriority, ScheduledEventStatus
from app.modules.events.schemas import RecipientCreate


class ScheduledEventCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=255)
    recipients: list[RecipientCreate]
    scheduled_for: datetime
    priority: EventPriority = EventPriority.MEDIUM
    template_id: uuid.UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None

    @field_validator("scheduled_for")
    @classmethod
    def must_be_future(cls, v: datetime) -> datetime:
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
