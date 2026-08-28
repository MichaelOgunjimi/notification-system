"""Credential module HTTP schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.credentials.types import ApiKeyScope


class ProjectApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    scopes: list[ApiKeyScope] = Field(min_length=1)
    rate_limit_per_min: int | None = Field(default=1000, ge=1)
    environment: Literal["test", "live"] = "live"


class ProjectApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    scopes: list[ApiKeyScope] | None = Field(default=None, min_length=1)
    rate_limit_per_min: int | None = Field(default=None, ge=1)


class ProjectApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    key_prefix: str
    name: str
    description: str | None
    environment: Literal["test", "live"]
    scopes: list[ApiKeyScope]
    is_active: bool
    rate_limit_per_min: int | None
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class CreatedProjectApiKeyResponse(ProjectApiKeyResponse):
    key: str
