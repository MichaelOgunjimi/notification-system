"""NotificationLog model — immutable audit trail of status changes."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Column, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.utils.datetime import utc_now


class NotificationLog(SQLModel, table=True):
    __tablename__ = "notification_logs"
    __table_args__ = (
        Index("idx_notification_logs_notification_id", "notification_id"),
        Index("idx_notification_logs_created_at", "created_at"),
        {"extend_existing": True},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    notification_id: uuid.UUID = Field(foreign_key="notifications.id")
    previous_status: str | None = Field(default=None, max_length=20)
    new_status: str = Field(max_length=20)
    worker_id: str | None = Field(default=None, max_length=255)
    error_type: str | None = Field(default=None, max_length=100)
    error_message: str | None = Field(default=None)
    provider_response: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    metadata_: dict[str, Any] | None = Field(
        default=None, sa_column=Column("metadata", JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=utc_now)
