"""Identity module request and response schemas."""

import uuid
from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator


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


class OAuthCodeExchangeRequest(BaseModel):
    code: str


class MessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    """Public profile and account state returned for an authenticated user."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: str
    name: str
    avatar_url: str | None
    is_active: bool
    email_verified_at: datetime | None
    created_at: datetime


class UserProfileUpdate(BaseModel):
    """Partial profile fields an authenticated user may update directly.

    Email is intentionally excluded because changing an identity address requires
    a separate ownership-verification workflow.
    """

    name: str | None = Field(default=None, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=2048)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str:
        """Trim a supplied display name and reject blank or null values."""
        if value is None or not (normalized := value.strip()):
            raise ValueError("Enter a display name")
        return normalized

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, value: str | None) -> str | None:
        """Allow removal or normalize an absolute HTTP(S) avatar URL."""
        if value is None:
            return None
        normalized = value.strip()
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Enter an absolute HTTP or HTTPS avatar URL")
        return normalized

    @model_validator(mode="after")
    def require_profile_change(self) -> "UserProfileUpdate":
        """Reject empty PATCH documents that do not request a profile change."""
        if not self.model_fields_set:
            raise ValueError("Provide a profile field to update")
        return self
