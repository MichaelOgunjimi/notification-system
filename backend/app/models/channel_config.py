"""ChannelConfig model — channel-specific configuration (credentials, defaults)."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.models.enums import NotificationChannel
from app.utils.datetime import utc_now


class ChannelConfig(SQLModel, table=True):
    __tablename__ = "channel_configs"
    __table_args__ = ({"extend_existing": True},)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    channel: NotificationChannel = Field(unique=True)
    is_enabled: bool = Field(default=True)
    rate_limit_per_min: int | None = Field(default=None)
    config: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
