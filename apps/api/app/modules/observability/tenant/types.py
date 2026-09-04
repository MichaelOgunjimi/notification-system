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
