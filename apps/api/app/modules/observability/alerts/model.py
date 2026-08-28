"""Alert rule model — per-project threshold-based monitoring rules."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.core.datetime import utc_now


class AlertRule(SQLModel, table=True):
    __tablename__ = "alert_rules"
    __table_args__ = ({"extend_existing": True},)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_key_id: uuid.UUID = Field(foreign_key="api_keys.id", index=True)
    name: str = Field(max_length=255)
    metric: str = Field(max_length=100)
    threshold: float
    window_minutes: int = Field(default=60)
    notify_email: str | None = Field(default=None, max_length=255)
    is_active: bool = Field(default=True)
    last_triggered_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now})
