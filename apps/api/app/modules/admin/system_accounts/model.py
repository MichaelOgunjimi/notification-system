"""Internal system accounts and scoped credentials."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class SystemAccount(SQLModel, table=True):
    __tablename__ = "system_accounts"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    slug: str = Field(max_length=100, unique=True, index=True)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool = Field(default=True, index=True)
    created_by_admin_user_id: uuid.UUID = Field(foreign_key="admin_users.id", index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})


class SystemCredential(SQLModel, table=True):
    __tablename__ = "system_credentials"
    __table_args__ = (
        UniqueConstraint(
            "system_account_id",
            "name",
            name="uq_system_credentials_account_name",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    system_account_id: uuid.UUID = Field(foreign_key="system_accounts.id", index=True)
    name: str = Field(max_length=255)
    key_hash: str = Field(max_length=64, unique=True, index=True)
    key_prefix: str = Field(max_length=16, index=True)
    permissions: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    is_active: bool = Field(default=True, index=True)
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
