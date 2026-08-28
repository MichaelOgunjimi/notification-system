"""Audit log model — immutable action history."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID | None = Field(
        default=None, foreign_key="organizations.id", index=True
    )
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id", index=True)
    actor_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id", index=True)
    api_key_id: uuid.UUID | None = Field(default=None, foreign_key="api_keys.id", index=True)
    action: str
    resource_type: str
    resource_id: str | None = None
    metadata_: dict[str, Any] = Field(default_factory=dict, sa_column=Column("metadata", JSON))
    ip_address: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
