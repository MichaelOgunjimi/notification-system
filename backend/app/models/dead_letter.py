"""DeadLetterMessage model — stores notifications that exhausted all retries."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Column, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.models.enums import DeadLetterStatus, NotificationChannel
from app.utils.datetime import utc_now


class DeadLetterMessage(SQLModel, table=True):
    __tablename__ = "dead_letter_messages"
    __table_args__ = (
        Index("idx_dlq_notification_id", "notification_id"),
        Index("idx_dlq_channel", "channel"),
        Index("idx_dlq_status", "status"),
        Index("idx_dlq_failed_at", "failed_at"),
        {"extend_existing": True},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    notification_id: uuid.UUID = Field(foreign_key="notifications.id", unique=True)
    channel: NotificationChannel
    recipient_address: str = Field(max_length=500)
    event_payload: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    error_type: str = Field(max_length=100)
    error_message: str
    retry_count: int
    retry_history: list[dict[str, Any]] = Field(sa_column=Column(JSONB, nullable=False))
    status: DeadLetterStatus = Field(default=DeadLetterStatus.ACTIVE)
    failed_at: datetime
    retried_at: datetime | None = Field(default=None)
    discarded_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
