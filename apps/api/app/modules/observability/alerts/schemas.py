"""Alert rule schemas — project-scoped delivery health monitoring."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.modules.observability.alerts.enums import AlertComparison, AlertMetric


class AlertRuleCreate(BaseModel):
    name: str
    metric: AlertMetric
    comparison: AlertComparison = AlertComparison.GREATER_THAN
    threshold: float
    window_minutes: int = 60
    notify_email: EmailStr | None = None
    is_active: bool = True


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    metric: AlertMetric | None = None
    comparison: AlertComparison | None = None
    threshold: float | None = None
    window_minutes: int | None = None
    notify_email: EmailStr | None = None
    is_active: bool | None = None


class AlertRuleResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    metric: AlertMetric
    comparison: AlertComparison
    threshold: float
    window_minutes: int
    notify_email: str | None
    is_active: bool
    last_triggered_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
