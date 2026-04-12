"""Suppression schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import NotificationChannel


class SuppressionCreate(BaseModel):
    channel: NotificationChannel
    recipient: str
    reason: str | None = None


class SuppressionResponse(BaseModel):
    id: uuid.UUID
    api_key_id: uuid.UUID
    channel: NotificationChannel
    recipient: str
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
