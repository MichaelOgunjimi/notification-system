"""Project persistence model."""

import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class Project(SQLModel, table=True):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "slug",
            name="uq_projects_organization_slug",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organization_id: uuid.UUID = Field(foreign_key="organizations.id", index=True)
    name: str = Field(max_length=255)
    slug: str = Field(max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    created_by_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
    archived_at: datetime | None = Field(default=None, index=True)
