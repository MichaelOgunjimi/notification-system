"""Suppression model — per-key blocked recipients."""

import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.enums import NotificationChannel
from app.utils.datetime import utc_now


class Suppression(SQLModel, table=True):
    __tablename__ = "suppressions"
    __table_args__ = (
        UniqueConstraint(
            "api_key_id",
            "channel",
            "recipient",
            name="uq_suppressions_key_channel_recipient",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_key_id: uuid.UUID = Field(foreign_key="api_keys.id", index=True)
    channel: NotificationChannel
    recipient: str
    reason: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
