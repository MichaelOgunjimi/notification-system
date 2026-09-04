"""Project-scoped and organization-wide observability schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TenantUsageResponse(BaseModel):
    project_id: uuid.UUID
    api_key_id: uuid.UUID
    endpoint: str
    hour_bucket: datetime
    request_count: int


class UsageEnvironmentSummaryResponse(BaseModel):
    environment: str
    total_requests: int
    successful_requests: int
    failed_requests: int


class TenantUsageSummaryResponse(BaseModel):
    total_requests: int
    successful_requests: int
    failed_requests: int
    project_count: int
    api_key_count: int
    by_environment: list[UsageEnvironmentSummaryResponse]


class TenantAuditLogResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    actor_name: str | None
    api_key_id: uuid.UUID | None
    api_key_name: str | None
    action: str
    resource_type: str
    resource_id: str | None
    metadata: dict[str, Any] = Field(default_factory=dict)
    ip_address: str | None
    created_at: datetime
