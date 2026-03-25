"""ApiKey model — API authentication keys for clients."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.utils.datetime import utc_now


class ApiKey(SQLModel, table=True):
    __tablename__ = "api_keys"
    __table_args__ = ({"extend_existing": True},)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    key_hash: str = Field(max_length=255, unique=True, index=True)
    key_prefix: str = Field(max_length=10, index=True)
    name: str = Field(max_length=255)
    description: str | None = Field(default=None)
    rate_limit_per_min: int | None = Field(default=None)
    is_active: bool = Field(default=True, index=True)
    last_used_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    revoked_at: datetime | None = Field(default=None)
