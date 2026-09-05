"""Template schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.modules.notifications.enums import NotificationChannel


class TemplateCreate(BaseModel):
    """Fields required to create a delivery template."""

    name: str = Field(min_length=1, max_length=255)
    channel: NotificationChannel
    subject: str | None = Field(default=None, max_length=500)
    body: str = Field(min_length=1)
    variables: list[str] = Field(default_factory=list)


class TemplateUpdate(BaseModel):
    """Partial template changes; nullable fields reject explicit null except subject."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    channel: NotificationChannel | None = None
    subject: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, min_length=1)
    variables: list[str] | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> "TemplateUpdate":
        """Reject null for fields whose database columns and runtime contracts are non-null."""

        for field_name in ("name", "channel", "body", "variables"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")
        return self


class TemplateResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID | None
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


class TemplatePreviewRequest(BaseModel):
    variables: dict[str, Any] = Field(default_factory=dict)


class TemplatePreviewResponse(BaseModel):
    subject: str | None
    body: str
