"""Template schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import NotificationChannel


class TemplateCreate(BaseModel):
    name: str
    channel: NotificationChannel
    subject: str | None = None
    body: str
    variables: list[str] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    name: str | None = None
    channel: NotificationChannel | None = None
    subject: str | None = None
    body: str | None = None
    variables: list[str] | None = None


class TemplateResponse(BaseModel):
    id: uuid.UUID
    api_key_id: uuid.UUID | None
    name: str
    channel: NotificationChannel
    subject: str | None
    body: str
    variables: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
