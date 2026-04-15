"""Alert rule model — threshold-based rules per API key."""

import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.utils.datetime import utc_now


class AlertRule(SQLModel, table=True):
    __tablename__ = "alert_rules"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    api_key_id: uuid.UUID = Field(foreign_key="api_keys.id", index=True)
    name: str
    metric: str
    threshold: float
    window_minutes: int = Field(default=60)
    notify_email: str | None = None
    is_active: bool = Field(default=True)
    last_triggered_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)
