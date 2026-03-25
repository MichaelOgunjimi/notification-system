"""Template CRUD schemas — TemplateCreateRequest, TemplateResponse, etc."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.enums import NotificationChannel


class TemplateCreate(BaseModel):
    name: str
    channel: NotificationChannel
    subject: str | None = None
    body: str
    variables: dict[str, Any] | list[Any] | None = None


class TemplateUpdate(BaseModel):
    name: str | None = None
    channel: NotificationChannel | None = None
    subject: str | None = None
    body: str | None = None
    variables: dict[str, Any] | list[Any] | None = None


class TemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    channel: NotificationChannel
    subject: str | None
    body: str
    variables: dict[str, Any] | list[Any]
    version: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TemplatePreview(BaseModel):
    template_id: uuid.UUID
    variables: dict[str, Any]


class TemplatePreviewResponse(BaseModel):
    subject: str | None
    body: str
