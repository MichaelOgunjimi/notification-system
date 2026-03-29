"""Event model — represents an incoming notification request from a client."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Column, Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.models.enums import EventPriority, EventStatus
from app.utils.datetime import utc_now


class Event(SQLModel, table=True):
    __tablename__ = "events"
    __table_args__ = (
        Index("idx_events_event_type", "event_type"),
        Index("idx_events_status", "status"),
        Index("idx_events_created_at", "created_at"),
        Index("idx_events_api_key_id", "api_key_id"),
        Index("idx_events_batch_id", "batch_id"),
        Index(
            "uq_events_idempotency",
            "api_key_id",
            "idempotency_key",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
        {"extend_existing": True},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_type: str = Field(max_length=255)
    priority: EventPriority = Field(default=EventPriority.MEDIUM)
    status: EventStatus = Field(default=EventStatus.ACCEPTED)
    template_id: uuid.UUID | None = Field(default=None, foreign_key="templates.id")
    payload: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    metadata_: dict[str, Any] | None = Field(
        default=None, sa_column=Column("metadata", JSONB, nullable=True)
    )
    api_key_id: uuid.UUID = Field(foreign_key="api_keys.id")
    idempotency_key: str | None = Field(default=None, max_length=255)
    batch_id: uuid.UUID | None = Field(default=None)
    recipient_count: int = Field(default=1)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
