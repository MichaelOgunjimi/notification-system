"""Platform administrator persistence model."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now
from app.modules.admin.types import AdminRole


class AdminUser(SQLModel, table=True):
    __tablename__ = "admin_users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    role: AdminRole = Field(default=AdminRole.AUDITOR)
    permissions: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    is_active: bool = Field(default=True, index=True)
    created_by_admin_user_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="admin_users.id",
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
