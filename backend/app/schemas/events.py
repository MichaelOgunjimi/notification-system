"""Event request/response schemas — EventCreateRequest, EventDetailResponse, etc."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.config import settings as app_settings
from app.models.enums import EventPriority, EventStatus, NotificationChannel


class RecipientCreate(BaseModel):
    user_id: str | None = None
    channels: list[NotificationChannel]
    email: str | None = None
    phone: str | None = None
    webhook_url: str | None = None


class EventCreate(BaseModel):
    event_type: str
    recipients: list[RecipientCreate]
    priority: EventPriority = EventPriority.MEDIUM
    template_id: uuid.UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None


class EventBatchCreate(BaseModel):
    events: list[EventCreate] = Field(..., min_length=1, max_length=app_settings.MAX_BATCH_SIZE)


class EventResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    priority: EventPriority
    status: EventStatus
    notification_ids: list[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class EventDetailResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    priority: EventPriority
    status: EventStatus
    template_id: uuid.UUID | None
    payload: dict[str, Any]
    metadata: dict[str, Any] | None
    api_key_id: uuid.UUID
    idempotency_key: str | None
    batch_id: uuid.UUID | None
    recipient_count: int
    notification_ids: list[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
