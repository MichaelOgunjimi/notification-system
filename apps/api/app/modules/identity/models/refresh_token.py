"""Durable refresh sessions tracked by JWT JTI."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_tokens"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    jti: str = Field(max_length=36, unique=True, index=True)
    expires_at: datetime
    revoked_at: datetime | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utc_now)
