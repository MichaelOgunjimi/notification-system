"""Scheduled event schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import EventPriority, ScheduledEventStatus


class ScheduledEventCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=255)
    recipients: list[dict[str, Any]]
    scheduled_for: datetime
    priority: EventPriority = EventPriority.MEDIUM
    template_id: uuid.UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None


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
