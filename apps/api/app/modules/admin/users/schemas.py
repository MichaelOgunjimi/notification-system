"""Platform administrator HTTP schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.admin.types import AdminPermission, AdminRole


class AdminUserCreate(BaseModel):
    email: EmailStr
    role: AdminRole
    permissions: list[AdminPermission] = Field(default_factory=list)


class AdminUserUpdate(BaseModel):
    role: AdminRole | None = None
    permissions: list[AdminPermission] | None = None
    is_active: bool | None = None


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    name: str
    role: AdminRole
    permissions: list[AdminPermission]
    is_active: bool
    created_at: datetime
    updated_at: datetime
