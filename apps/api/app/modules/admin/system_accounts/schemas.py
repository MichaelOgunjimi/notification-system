"""System-account HTTP schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.admin.types import SystemPermission


class SystemAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: str | None = Field(default=None, max_length=1000)


class SystemAccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None


class SystemAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SystemCredentialCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    permissions: list[SystemPermission] = Field(min_length=1)


class SystemCredentialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    system_account_id: uuid.UUID
    name: str
    key_prefix: str
    permissions: list[SystemPermission]
    is_active: bool
    last_used_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class CreatedSystemCredentialResponse(SystemCredentialResponse):
    key: str
