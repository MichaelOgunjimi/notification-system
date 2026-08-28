"""RetryPolicy model — configurable retry behavior per notification channel."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now
from app.modules.notifications.enums import NotificationChannel


class RetryPolicy(SQLModel, table=True):
    __tablename__ = "retry_policies"
    __table_args__ = ({"extend_existing": True},)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    channel: NotificationChannel = Field(unique=True)
    max_retries: int = Field(default=5)
    base_delay_seconds: int = Field(default=10)
    max_backoff_seconds: int = Field(default=600)
    jitter_enabled: bool = Field(default=True)
    retry_on_timeout: bool = Field(default=True)
    retry_on_5xx: bool = Field(default=True)
    retry_on_4xx: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
