"""Event request/response schemas — EventCreateRequest, EventDetailResponse, etc."""

import ipaddress
import json
import re
import socket
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, Field, HttpUrl, TypeAdapter, field_validator

from app.core.config import settings as app_settings
from app.models.enums import EventPriority, EventStatus, NotificationChannel

_PHONE_RE = re.compile(r"^\+[1-9]\d{6,14}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_HTTP_URL_ADAPTER = TypeAdapter(HttpUrl)


def _is_blocked_ip(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True
    return (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified
    )


class RecipientCreate(BaseModel):
    user_id: str | None = None
    channels: list[NotificationChannel]
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=20)
    webhook_url: str | None = Field(default=None, max_length=2048)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str | None) -> str | None:
        if v is not None and not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address format")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, v: str | None) -> str | None:
        if v is not None and not _PHONE_RE.match(v):
            raise ValueError("Phone must be E.164 format (e.g. +15551234567)")
        return v

    @field_validator("webhook_url")
    @classmethod
    def validate_webhook_url(cls, v: str | None) -> str | None:
        if v is None:
            return v

        parsed_input = urlparse(v)
        if parsed_input.scheme not in ("http", "https"):
            raise ValueError("Webhook URL must use http:// or https://")
        if not parsed_input.hostname:
            raise ValueError("Webhook URL must have a valid hostname")

        try:
            validated_url = _HTTP_URL_ADAPTER.validate_python(v)
        except Exception as exc:
            raise ValueError("Webhook URL must be a valid URL") from exc

        parsed = urlparse(str(validated_url))
        host = parsed.hostname
        if host is None:
            raise ValueError("Webhook URL must have a valid hostname")
        port = parsed.port or (443 if parsed.scheme == "https" else 80)

        try:
            addrinfo = socket.getaddrinfo(host, port)
        except socket.gaierror as exc:
            raise ValueError("Webhook URL host could not be resolved") from exc

        if not addrinfo:
            raise ValueError("Webhook URL host could not be resolved")

        for _, _, _, _, sockaddr in addrinfo:
            ip_value = str(sockaddr[0])
            if _is_blocked_ip(ip_value):
                raise ValueError("Webhook URL host resolves to a private/internal address")
        return str(validated_url)


class EventCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=255)
    recipients: list[RecipientCreate]
    priority: EventPriority = EventPriority.MEDIUM
    template_id: uuid.UUID | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=255)

    @field_validator("payload")
    @classmethod
    def validate_payload_size(cls, v: dict[str, Any]) -> dict[str, Any]:
        from app.core.config import settings as _settings

        size = len(json.dumps(v, separators=(",", ":")))
        if size > _settings.MAX_PAYLOAD_BYTES:
            raise ValueError(
                f"payload exceeds maximum size of {_settings.MAX_PAYLOAD_BYTES} bytes "
                f"(got {size} bytes)"
            )
        return v

    @field_validator("metadata")
    @classmethod
    def validate_metadata_size(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is None:
            return v
        from app.core.config import settings as _settings

        size = len(json.dumps(v, separators=(",", ":")))
        if size > _settings.MAX_PAYLOAD_BYTES:
            raise ValueError(
                f"metadata exceeds maximum size of {_settings.MAX_PAYLOAD_BYTES} bytes "
                f"(got {size} bytes)"
            )
        return v


class EventBatchCreate(BaseModel):
    events: list[EventCreate] = Field(..., min_length=1, max_length=app_settings.MAX_BATCH_SIZE)


class EventResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    priority: EventPriority
    status: EventStatus
    notification_ids: list[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class EventDetailResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    priority: EventPriority
    status: EventStatus
    template_id: uuid.UUID | None
    payload: dict[str, Any]
    metadata: dict[str, Any] | None
    idempotency_key: str | None
    batch_id: uuid.UUID | None
    recipient_count: int
    notification_ids: list[uuid.UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
