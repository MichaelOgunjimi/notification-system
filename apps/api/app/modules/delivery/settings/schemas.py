"""Delivery-policy response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class ChannelConfigResponse(BaseModel):
    id: uuid.UUID
    channel: str
    is_enabled: bool
    rate_limit_per_min: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RetryPolicyResponse(BaseModel):
    id: uuid.UUID
    channel: str
    max_retries: int
    base_delay_seconds: int
    max_backoff_seconds: int
    jitter_enabled: bool
    retry_on_timeout: bool
    retry_on_5xx: bool
    retry_on_4xx: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
