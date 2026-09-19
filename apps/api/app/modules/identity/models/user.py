"""User identity managed through the dashboard."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class User(SQLModel, table=True):
    """Authenticated human account and its application-owned profile fields."""

    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(max_length=320, unique=True, index=True)
    name: str = Field(max_length=255)
    avatar_url: str | None = Field(default=None, max_length=2048)
    is_active: bool = Field(default=True, index=True)
    email_verified_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
