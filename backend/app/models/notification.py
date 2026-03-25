"""Notification model — individual notification instance per recipient per channel."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Column, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.models.enums import EventPriority, NotificationChannel, NotificationStatus
from app.utils.datetime import utc_now


class Notification(SQLModel, table=True):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("idx_notifications_event_id", "event_id"),
        Index("idx_notifications_status", "status"),
        Index("idx_notifications_channel", "channel"),
        Index("idx_notifications_created_at", "created_at"),
        Index("idx_notifications_celery_task_id", "celery_task_id"),
        Index("idx_notifications_channel_status", "channel", "status"),
        {"extend_existing": True},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_id: uuid.UUID = Field(foreign_key="events.id")
    channel: NotificationChannel
    status: NotificationStatus = Field(default=NotificationStatus.PENDING)
    priority: EventPriority = Field(default=EventPriority.MEDIUM)
    recipient_user_id: str = Field(max_length=255)
    recipient_address: str = Field(max_length=500)
    webhook_secret: str | None = Field(default=None, max_length=500)
    rendered_subject: str | None = Field(default=None)
    rendered_body: str | None = Field(default=None)
    retry_count: int = Field(default=0)
    max_retries: int = Field(default=5)
    next_retry_at: datetime | None = Field(default=None)
    celery_task_id: str | None = Field(default=None, max_length=255)
    provider_response: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    error_message: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    queued_at: datetime | None = Field(default=None)
    processing_started_at: datetime | None = Field(default=None)
    delivered_at: datetime | None = Field(default=None)
    failed_at: datetime | None = Field(default=None)
    updated_at: datetime = Field(default_factory=utc_now)
