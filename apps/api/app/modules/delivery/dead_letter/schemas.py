"""Dead letter queue schemas — response models for DLQ management API."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.modules.delivery.enums import DeadLetterStatus
from app.modules.notifications.enums import NotificationChannel


class DeadLetterResponse(BaseModel):
    """Summary view for list endpoints."""

    id: uuid.UUID
    notification_id: uuid.UUID
    channel: NotificationChannel
    recipient_address: str
    error_type: str
    error_message: str
    retry_count: int
    status: DeadLetterStatus
    failed_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class DeadLetterDetailResponse(BaseModel):
    """Full detail view with retry history and event payload."""

    id: uuid.UUID
    notification_id: uuid.UUID
    channel: NotificationChannel
    recipient_address: str
    event_payload: dict[str, Any]
    error_type: str
    error_message: str
    retry_count: int
    retry_history: list[dict[str, Any]]
    status: DeadLetterStatus
    failed_at: datetime
    retried_at: datetime | None
    discarded_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
