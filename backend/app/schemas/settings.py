"""Settings schemas — ApiKeyCreateRequest, ChannelConfigResponse, RetryPolicyResponse."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ApiKeyCreate(BaseModel):
    name: str
    rate_limit_per_min: int | None = Field(default=1000)
    expires_at: datetime | None = None


class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    key_prefix: str
    name: str
    is_active: bool
    rate_limit_per_min: int | None
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class ApiKeyCreateResponse(ApiKeyResponse):
    key: str
