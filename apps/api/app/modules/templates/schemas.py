"""Template schemas."""

import uuid
from datetime import datetime
from typing import Any, Literal

from jinja2.exceptions import TemplateError
from pydantic import BaseModel, Field, computed_field, model_validator

from app.modules.delivery.sender import FromLocal, FromName, ReplyTo
from app.modules.notifications.enums import NotificationChannel


class TemplateCreate(BaseModel):
    """Fields required to create a delivery template."""

    name: str = Field(min_length=1, max_length=255)
    channel: NotificationChannel
    subject: str | None = Field(default=None, max_length=500)
    body: str = Field(min_length=1)
    text_body: str | None = None
    from_local: FromLocal = None
    from_name: FromName = None
    reply_to: ReplyTo = None
    variables: list[str] | None = None
    on_missing_variable: Literal["error", "blank"] = "error"

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "order-confirmed",
                "channel": "email",
                "subject": "Order {{ order_number }} confirmed",
                "body": "<h1>Thanks, {{ customer_name }}</h1>",
                "text_body": "Thanks, {{ customer_name }}",
                "from_local": "orders",
                "from_name": "Winwell Orders",
                "reply_to": "support@winwell.example",
                "on_missing_variable": "error",
            }
        }
    }


class TemplateUpdate(BaseModel):
    """Partial template changes; nullable fields reject explicit null except subject."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    channel: NotificationChannel | None = None
    subject: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, min_length=1)
    text_body: str | None = None
    from_local: FromLocal = None
    from_name: FromName = None
    reply_to: ReplyTo = None
    variables: list[str] | None = None
    on_missing_variable: Literal["error", "blank"] | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> "TemplateUpdate":
        """Reject null for fields whose database columns and runtime contracts are non-null."""

        for field_name in ("name", "channel", "body", "variables", "on_missing_variable"):
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
    text_body: str | None
    from_local: str | None
    from_name: str | None
    reply_to: str | None
    variables: list[str]
    on_missing_variable: Literal["error", "blank"]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[prop-decorator]
    @property
    def detected_variables(self) -> list[str]:
        """Return variables referenced by the stored subject and bodies."""
        from app.modules.templates.service import detect_variables

        try:
            return detect_variables(self.body, self.subject, self.text_body)
        except TemplateError:
            return sorted(set(self.variables))


class TemplateUpsert(BaseModel):
    """Template content synchronized by the name and channel in the URL."""

    subject: str | None = Field(default=None, max_length=500)
    body: str = Field(min_length=1)
    text_body: str | None = None
    from_local: FromLocal = None
    from_name: FromName = None
    reply_to: ReplyTo = None
    variables: list[str] | None = None
    on_missing_variable: Literal["error", "blank"] = "error"

    model_config = {
        "json_schema_extra": {
            "example": {
                "subject": "Order {{ order_number }} confirmed",
                "body": "<h1>Thanks, {{ customer_name }}</h1>",
                "text_body": "Thanks, {{ customer_name }}",
            }
        }
    }


class TemplateImportRequest(BaseModel):
    """Plain HTML plus sample values used to identify variable text nodes."""

    name: str = Field(min_length=1, max_length=255)
    subject: str | None = Field(default=None, max_length=500)
    html: str = Field(min_length=1)
    variables: dict[str, str] = Field(default_factory=dict)

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "order-confirmed",
                "subject": "Your order is confirmed",
                "html": "<h1>Thanks, Chidi</h1>",
                "variables": {"customer_name": "Chidi"},
            }
        }
    }


class TemplatePreviewRequest(BaseModel):
    variables: dict[str, Any] = Field(default_factory=dict)


class TemplatePreviewResponse(BaseModel):
    subject: str | None
    html: str
    text: str
    variables_used: list[str]
    missing_variables: list[str]
    # Kept for clients using the original preview response.
    body: str


class TemplateImportResponse(BaseModel):
    """Imported template and its preview rendered with the supplied samples."""

    template: TemplateResponse
    preview: TemplatePreviewResponse
