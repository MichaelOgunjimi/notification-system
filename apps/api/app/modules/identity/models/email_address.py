"""Verified email identities that can authenticate a User."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Index, text
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class EmailAddress(SQLModel, table=True):
    __tablename__ = "email_addresses"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="ck_email_addresses_normalized"),
        Index(
            "uq_email_addresses_primary_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    email: str = Field(max_length=320, unique=True, index=True)
    is_primary: bool = Field(default=False)
    verified_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
