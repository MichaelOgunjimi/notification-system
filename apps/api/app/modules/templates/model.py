"""Template model — per-key templates with optional system defaults."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now
from app.modules.notifications.enums import NotificationChannel


class Template(SQLModel, table=True):
    __tablename__ = "templates"
    __table_args__ = {"extend_existing": True}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_key_id: uuid.UUID | None = Field(default=None, foreign_key="api_keys.id", index=True)
    name: str = Field(index=True, max_length=255)
    channel: NotificationChannel
    subject: str | None = Field(default=None, max_length=500)
    body: str
    variables: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
