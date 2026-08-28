"""Identity module request and response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class MagicLinkRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        local, separator, domain = normalized.partition("@")
        if not separator or not local or "." not in domain:
            raise ValueError("Enter a valid email address")
        return normalized


class MagicLinkVerifyRequest(BaseModel):
    token: str


class MessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: str
    name: str
    is_active: bool
    email_verified_at: datetime | None
    created_at: datetime
