"""Alert rule schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class AlertRuleCreate(BaseModel):
    name: str
    metric: str
    threshold: float
    window_minutes: int = 60
    notify_email: EmailStr | None = None
    is_active: bool = True


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    metric: str | None = None
    threshold: float | None = None
    window_minutes: int | None = None
    notify_email: EmailStr | None = None
    is_active: bool | None = None


class AlertRuleResponse(BaseModel):
    id: uuid.UUID
    api_key_id: uuid.UUID
    name: str
    metric: str
    threshold: float
    window_minutes: int
    notify_email: str | None
    is_active: bool
    last_triggered_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
