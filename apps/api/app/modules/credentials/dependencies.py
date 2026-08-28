"""Resolve and authorize project API-key credentials."""

import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from app.core.http.dependencies import SessionDep
from app.modules.credentials.authentication import validate_api_key
from app.modules.credentials.model import ApiKey
from app.modules.credentials.types import ApiKeyScope


async def get_current_api_key(
    request: Request,
    x_api_key: str = Header(..., alias="X-API-Key"),
    *,
    db: SessionDep,
) -> ApiKey:
    api_key = await validate_api_key(db, x_api_key)
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
        )
    request.state.api_key_id = api_key.id
    return api_key


def api_key_filter_id(api_key: ApiKey) -> uuid.UUID:
    return api_key.id


ApiKeyDep = Annotated[ApiKey, Depends(get_current_api_key)]


def require_api_key_scope(scope: ApiKeyScope) -> Callable[..., Awaitable[ApiKey]]:
    async def require_scope(api_key: ApiKeyDep) -> ApiKey:
        if scope.value in set(api_key.scopes):
            return api_key
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API key requires scope: {scope.value}",
        )

    return require_scope


EventsReadApiKeyDep = Annotated[ApiKey, Depends(require_api_key_scope(ApiKeyScope.EVENTS_READ))]
EventsWriteApiKeyDep = Annotated[ApiKey, Depends(require_api_key_scope(ApiKeyScope.EVENTS_WRITE))]
TemplatesReadApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.TEMPLATES_READ))
]
TemplatesWriteApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.TEMPLATES_WRITE))
]
NotificationsReadApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.NOTIFICATIONS_READ))
]
ScheduledEventsReadApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.SCHEDULED_EVENTS_READ))
]
ScheduledEventsWriteApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.SCHEDULED_EVENTS_WRITE))
]
SuppressionsReadApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.SUPPRESSIONS_READ))
]
SuppressionsWriteApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.SUPPRESSIONS_WRITE))
]
AlertsReadApiKeyDep = Annotated[ApiKey, Depends(require_api_key_scope(ApiKeyScope.ALERTS_READ))]
AlertsWriteApiKeyDep = Annotated[ApiKey, Depends(require_api_key_scope(ApiKeyScope.ALERTS_WRITE))]
AnalyticsReadApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.ANALYTICS_READ))
]
DeadLettersReadApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.DEAD_LETTERS_READ))
]
DeadLettersWriteApiKeyDep = Annotated[
    ApiKey, Depends(require_api_key_scope(ApiKeyScope.DEAD_LETTERS_WRITE))
]
UsageReadApiKeyDep = Annotated[ApiKey, Depends(require_api_key_scope(ApiKeyScope.USAGE_READ))]
AuditReadApiKeyDep = Annotated[ApiKey, Depends(require_api_key_scope(ApiKeyScope.AUDIT_READ))]
SettingsReadApiKeyDep = Annotated[ApiKey, Depends(require_api_key_scope(ApiKeyScope.SETTINGS_READ))]
