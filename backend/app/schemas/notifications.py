"""Notification response schemas — NotificationResponse, NotificationListParams, etc."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import NotificationChannel, NotificationStatus


class NotificationLogResponse(BaseModel):
    id: uuid.UUID
    status: str
    message: str | None
    attempt_number: int
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    channel: NotificationChannel
    recipient: str
    status: NotificationStatus
    retry_count: int
    created_at: datetime
    updated_at: datetime
    delivered_at: datetime | None

    model_config = {"from_attributes": True}


class NotificationDetailResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    channel: NotificationChannel
    recipient: str
    status: NotificationStatus
    priority: str
    recipient_user_id: str
    rendered_subject: str | None
    rendered_body: str | None
    retry_count: int
    max_retries: int
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    delivered_at: datetime | None
    logs: list[NotificationLogResponse]

    model_config = {"from_attributes": True}


class NotificationListParams(BaseModel):
    status: NotificationStatus | None = None
    channel: NotificationChannel | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    recipient: str | None = None
