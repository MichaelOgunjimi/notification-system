"""Template model — Jinja2-based notification templates scoped to a channel."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Column, Index, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.models.enums import NotificationChannel
from app.utils.datetime import utc_now


class Template(SQLModel, table=True):
    __tablename__ = "templates"
    __table_args__ = (
        Index("idx_templates_name", "name"),
        Index("idx_templates_channel", "channel"),
        Index("idx_templates_is_active", "is_active"),
        Index(
            "uq_templates_name_channel",
            "name",
            "channel",
            unique=True,
            postgresql_where=text("is_active = true"),
        ),
        {"extend_existing": True},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    channel: NotificationChannel
    subject: str | None = Field(default=None, max_length=500)
    body: str
    variables: dict[str, Any] | list[Any] = Field(
        default=[], sa_column=Column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    )
    version: int = Field(default=1)
    is_active: bool = Field(default=True)
    metadata_: dict[str, Any] | None = Field(
        default=None, sa_column=Column("metadata", JSONB, nullable=True)
    )
    created_by: uuid.UUID | None = Field(default=None, foreign_key="api_keys.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
