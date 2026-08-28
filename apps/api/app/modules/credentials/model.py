"""Project API Key persistence model."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class ApiKey(SQLModel, table=True):
    __tablename__ = "api_keys"
    __table_args__ = ({"extend_existing": True},)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    created_by_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    key_hash: str = Field(max_length=255, unique=True, index=True)
    key_prefix: str = Field(max_length=10, index=True)
    name: str = Field(max_length=255)
    description: str | None = Field(default=None)
    environment: str = Field(default="live", max_length=20, index=True)
    scopes: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    rate_limit_per_min: int | None = Field(default=None)
    is_active: bool = Field(default=True, index=True)
    last_used_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
    revoked_at: datetime | None = Field(default=None)
    rotated_from_id: uuid.UUID | None = Field(default=None, foreign_key="api_keys.id", index=True)
