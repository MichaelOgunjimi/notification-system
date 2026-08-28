"""Suppression model — per-key blocked recipients."""

import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now
from app.modules.notifications.enums import NotificationChannel
from app.modules.suppressions.enums import SuppressionReason, SuppressionSource


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
    reason: SuppressionReason = Field(default=SuppressionReason.MANUAL)
    source: SuppressionSource = Field(default=SuppressionSource.CLIENT)
    created_at: datetime = Field(default_factory=utc_now)
