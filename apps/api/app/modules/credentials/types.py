"""Credential scopes and values exposed by the credentials Module."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ApiKeyScope(StrEnum):
    EVENTS_READ = "events:read"
    EVENTS_WRITE = "events:write"
    TEMPLATES_READ = "templates:read"
    TEMPLATES_WRITE = "templates:write"
    NOTIFICATIONS_READ = "notifications:read"
    SCHEDULED_EVENTS_READ = "scheduled_events:read"
    SCHEDULED_EVENTS_WRITE = "scheduled_events:write"
    SUPPRESSIONS_READ = "suppressions:read"
    SUPPRESSIONS_WRITE = "suppressions:write"
    ALERTS_READ = "alerts:read"
    ALERTS_WRITE = "alerts:write"
    ANALYTICS_READ = "analytics:read"
    DEAD_LETTERS_READ = "dead_letters:read"
    DEAD_LETTERS_WRITE = "dead_letters:write"
    USAGE_READ = "usage:read"
    AUDIT_READ = "audit:read"
    SETTINGS_READ = "settings:read"


ALL_API_KEY_SCOPES: tuple[str, ...] = tuple(scope.value for scope in ApiKeyScope)


@dataclass(frozen=True, slots=True)
class ApiKeyView:
    id: uuid.UUID
    project_id: uuid.UUID
    key_prefix: str
    name: str
    description: str | None
    environment: str
    scopes: list[str]
    is_active: bool
    rate_limit_per_min: int | None
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None
    rotated_from_id: uuid.UUID | None


@dataclass(frozen=True, slots=True)
class CreatedApiKeyView(ApiKeyView):
    key: str
