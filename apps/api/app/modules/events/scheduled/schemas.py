"""Scheduled event schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.core.datetime import to_naive_utc, utc_now
from app.modules.events.enums import EventPriority, EventStatus, ScheduledEventStatus
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


class TenantScheduledEventResponse(BaseModel):
    """A scheduled event as the dashboard lists it (session-authenticated, per project)."""

    id: uuid.UUID
    event_type: str
    scheduled_for: datetime
    priority: EventPriority
    status: ScheduledEventStatus
    event_id: uuid.UUID | None
    # Status of the real event once dispatched, so the UI can tell "sent" from "delivered".
    event_status: EventStatus | None
    failure_reason: str | None
    api_key_id: uuid.UUID
    api_key_name: str
    api_key_environment: str
    content_source: str
    recipient_count: int
    channels: list[str]
    first_recipient: str | None
    created_at: datetime
    updated_at: datetime


class TenantScheduledRecipient(BaseModel):
    user_id: str | None
    channels: list[str]
    addresses: list[str]


class TenantScheduledAttachment(BaseModel):
    """Attachment summary; the download URL is never exposed to the dashboard."""

    filename: str
    size_bytes: int


class TenantScheduledEventDetailResponse(TenantScheduledEventResponse):
    template_id: uuid.UUID | None
    template_name: str | None
    subject: str | None
    recipients: list[TenantScheduledRecipient]
    attachments: list[TenantScheduledAttachment]
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None
