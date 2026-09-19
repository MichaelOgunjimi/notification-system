"""Template model — per-project templates with optional system defaults."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Column, Index, text
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now
from app.modules.notifications.enums import NotificationChannel


class Template(SQLModel, table=True):
    """A project's own template, or a system default when project_id is None.

    Every key in a project shares one template pool — ownership is at the
    project level, not the individual key. api_key_id records which key was
    used to create the template (via the self-service API) for provenance
    only; it plays no part in resolution or authorization.
    """

    __tablename__ = "templates"
    __table_args__ = (
        # Partial: excludes soft-deleted rows, so a re-created template can
        # reuse the name of one it replaced. NULL project_id (system
        # defaults) never conflicts — Postgres treats each NULL as distinct.
        Index(
            "uq_templates_project_active",
            "project_id",
            "name",
            "channel",
            unique=True,
            postgresql_where=text("project_id IS NOT NULL AND is_active = true"),
            sqlite_where=text("project_id IS NOT NULL AND is_active = 1"),
        ),
        Index(
            "uq_templates_system_default_active",
            "name",
            "channel",
            unique=True,
            postgresql_where=text("project_id IS NULL AND is_active = true"),
            sqlite_where=text("project_id IS NULL AND is_active = 1"),
        ),
        {"extend_existing": True},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="projects.id", index=True)
    api_key_id: uuid.UUID | None = Field(default=None, foreign_key="api_keys.id", index=True)
    name: str = Field(index=True, max_length=255)
    channel: NotificationChannel
    subject: str | None = Field(default=None, max_length=500)
    body: str
    variables: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
