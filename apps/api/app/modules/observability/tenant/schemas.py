"""Project-scoped and organization-wide observability schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TenantUsageResponse(BaseModel):
    project_id: uuid.UUID
    api_key_id: uuid.UUID
    api_key_name: str
    api_key_environment: str
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


class TenantUsageHourlyPointResponse(BaseModel):
    hour: int
    request_count: int


class TenantUsageEndpointResponse(BaseModel):
    endpoint: str
    request_count: int


class TenantEventResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    priority: str
    status: str
    recipient_count: int
    api_key_id: uuid.UUID
    api_key_name: str
    api_key_environment: str
    has_failures: bool
    created_at: datetime


class TenantEventNotificationResponse(BaseModel):
    id: uuid.UUID
    channel: str
    status: str
    recipient_address: str
    error_message: str | None
    created_at: datetime
    delivered_at: datetime | None


class TenantEventDetailResponse(BaseModel):
    id: uuid.UUID
    event_type: str
    priority: str
    status: str
    recipient_count: int
    api_key_id: uuid.UUID
    api_key_name: str
    api_key_environment: str
    idempotency_key: str | None
    batch_id: uuid.UUID | None
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
    notifications: list[TenantEventNotificationResponse]


class TenantAuditLogResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    actor_name: str | None
    actor_role: str | None
    api_key_id: uuid.UUID | None
    api_key_name: str | None
    api_key_environment: str | None
    action: str
    resource_type: str
    resource_id: str | None
    metadata: dict[str, Any] = Field(default_factory=dict)
    ip_address: str | None
    created_at: datetime
