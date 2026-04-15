"""ScheduledEvent model — holds events queued for deferred delivery."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Column, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.models.enums import EventPriority, ScheduledEventStatus
from app.utils.datetime import utc_now


class ScheduledEvent(SQLModel, table=True):
    __tablename__ = "scheduled_events"
    __table_args__ = (
        Index("idx_scheduled_events_api_key_id", "api_key_id"),
        Index("idx_scheduled_events_scheduled_for", "scheduled_for"),
        Index("idx_scheduled_events_status", "status"),
        {"extend_existing": True},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_key_id: uuid.UUID = Field(foreign_key="api_keys.id")
    payload: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    scheduled_for: datetime
    priority: EventPriority = Field(default=EventPriority.MEDIUM)
    status: ScheduledEventStatus = Field(default=ScheduledEventStatus.PENDING)
    event_id: uuid.UUID | None = Field(default=None, foreign_key="events.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
