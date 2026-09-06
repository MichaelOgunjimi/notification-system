"""Values returned by tenant observability queries."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class UsageView:
    project_id: uuid.UUID
    api_key_id: uuid.UUID
    api_key_name: str
    api_key_environment: str
    endpoint: str
    hour_bucket: datetime
    request_count: int


@dataclass(frozen=True, slots=True)
class UsageEnvironmentSummary:
    environment: str
    total_requests: int
    successful_requests: int
    failed_requests: int


@dataclass(frozen=True, slots=True)
class UsageSummaryView:
    total_requests: int
    successful_requests: int
    failed_requests: int
    project_count: int
    api_key_count: int
    by_environment: list[UsageEnvironmentSummary]


@dataclass(frozen=True, slots=True)
class UsageHourlyPointView:
    """Request volume for one hour of the day (0-23, UTC), summed across every
    matching day in the queried range."""

    hour: int
    request_count: int


@dataclass(frozen=True, slots=True)
class UsageEndpointView:
    endpoint: str
    request_count: int


@dataclass(frozen=True, slots=True)
class EventView:
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


@dataclass(frozen=True, slots=True)
class EventNotificationView:
    id: uuid.UUID
    channel: str
    status: str
    recipient_address: str
    error_message: str | None
    created_at: datetime
    delivered_at: datetime | None


@dataclass(frozen=True, slots=True)
class EventDetailView:
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
    payload: dict[str, Any]
    metadata: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    notifications: list[EventNotificationView]


@dataclass(frozen=True, slots=True)
class AuditLogView:
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
    metadata: dict[str, Any]
    ip_address: str | None
    created_at: datetime
