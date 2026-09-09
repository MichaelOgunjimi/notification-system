"""HTTP adapter for project and organization observability."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.core.pagination import Page
from app.modules.events.enums import EventPriority, EventStatus
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.observability.analytics.schemas import AnalyticsResponse, TrendResponse
from app.modules.observability.tenant import service
from app.modules.observability.tenant.schemas import (
    TenantAuditLogResponse,
    TenantEventDetailResponse,
    TenantEventResponse,
    TenantNotificationDetailResponse,
    TenantNotificationResponse,
    TenantUsageEndpointResponse,
    TenantUsageHourlyPointResponse,
    TenantUsageResponse,
    TenantUsageSummaryResponse,
)
from app.modules.observability.tenant.types import (
    AuditLogView,
    EventView,
    NotificationView,
    UsageEndpointView,
    UsageHourlyPointView,
    UsageSummaryView,
    UsageView,
)

router = APIRouter(tags=["tenant-observability"])


@router.get(
    "/projects/{project_id}/usage",
    response_model=PaginatedResponse[TenantUsageResponse],
)
async def get_project_usage(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
) -> Page[UsageView]:
    return await service.get_project_usage(
        db,
        user_id=user.id,
        project_id=project_id,
        page=page,
        per_page=per_page,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
    )


@router.get(
    "/organizations/{organization_id}/usage",
    response_model=PaginatedResponse[TenantUsageResponse],
)
async def get_organization_usage(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
) -> Page[UsageView]:
    return await service.get_organization_usage(
        db,
        user_id=user.id,
        organization_id=organization_id,
        page=page,
        per_page=per_page,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
    )


@router.get(
    "/projects/{project_id}/usage/summary",
    response_model=TenantUsageSummaryResponse,
)
async def get_project_usage_summary(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
) -> UsageSummaryView:
    return await service.get_project_usage_summary(
        db,
        user_id=user.id,
        project_id=project_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
    )


@router.get(
    "/projects/{project_id}/usage/hourly",
    response_model=list[TenantUsageHourlyPointResponse],
)
async def get_project_usage_hourly_distribution(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
) -> list[UsageHourlyPointView]:
    return await service.get_project_usage_hourly_distribution(
        db,
        user_id=user.id,
        project_id=project_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
    )


@router.get(
    "/projects/{project_id}/usage/top-endpoints",
    response_model=list[TenantUsageEndpointResponse],
)
async def get_project_top_endpoints(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
) -> list[UsageEndpointView]:
    return await service.get_project_top_endpoints(
        db,
        user_id=user.id,
        project_id=project_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
        limit=limit,
    )


@router.get(
    "/organizations/{organization_id}/usage/summary",
    response_model=TenantUsageSummaryResponse,
)
async def get_organization_usage_summary(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
) -> UsageSummaryView:
    return await service.get_organization_usage_summary(
        db,
        user_id=user.id,
        organization_id=organization_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
    )


@router.get(
    "/organizations/{organization_id}/usage/hourly",
    response_model=list[TenantUsageHourlyPointResponse],
)
async def get_organization_usage_hourly_distribution(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
) -> list[UsageHourlyPointView]:
    return await service.get_organization_usage_hourly_distribution(
        db,
        user_id=user.id,
        organization_id=organization_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
    )


@router.get(
    "/organizations/{organization_id}/usage/top-endpoints",
    response_model=list[TenantUsageEndpointResponse],
)
async def get_organization_top_endpoints(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
) -> list[UsageEndpointView]:
    return await service.get_organization_top_endpoints(
        db,
        user_id=user.id,
        organization_id=organization_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
        limit=limit,
    )


@router.get(
    "/projects/{project_id}/audit-log",
    response_model=PaginatedResponse[TenantAuditLogResponse],
)
async def get_project_audit_log(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    action: str | None = Query(default=None),
    actor: str | None = Query(
        default=None,
        description='"user", "api_key", or a specific user/API-key id.',
    ),
    category: str | None = Query(
        default=None,
        description='"governance" or "operational" to restrict to that surface.',
    ),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
) -> Page[AuditLogView]:
    return await service.get_project_audit_log(
        db,
        user_id=user.id,
        project_id=project_id,
        page=page,
        per_page=per_page,
        action=action,
        actor=actor,
        category=category,
        from_=from_,
        to=to,
    )


@router.get(
    "/organizations/{organization_id}/audit-log",
    response_model=PaginatedResponse[TenantAuditLogResponse],
)
async def get_organization_audit_log(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    action: str | None = Query(default=None),
    actor: str | None = Query(
        default=None,
        description='"user", "api_key", or a specific user/API-key id.',
    ),
    category: str | None = Query(
        default=None,
        description='"governance" or "operational" to restrict to that surface.',
    ),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
) -> Page[AuditLogView]:
    return await service.get_organization_audit_log(
        db,
        user_id=user.id,
        organization_id=organization_id,
        page=page,
        per_page=per_page,
        action=action,
        actor=actor,
        category=category,
        from_=from_,
        to=to,
    )


@router.get(
    "/projects/{project_id}/analytics",
    response_model=AnalyticsResponse,
)
async def get_project_analytics(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
) -> AnalyticsResponse:
    return await service.get_project_analytics(
        db,
        user_id=user.id,
        project_id=project_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
    )


@router.get(
    "/organizations/{organization_id}/analytics",
    response_model=AnalyticsResponse,
)
async def get_organization_analytics(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
) -> AnalyticsResponse:
    return await service.get_organization_analytics(
        db,
        user_id=user.id,
        organization_id=organization_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
    )


@router.get(
    "/projects/{project_id}/analytics/trends",
    response_model=TrendResponse,
)
async def get_project_trends(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    granularity: str = Query(default="day", description="Bucket size: 'hour' or 'day'."),
) -> TrendResponse:
    return await service.get_project_trends(
        db,
        user_id=user.id,
        project_id=project_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
        granularity=granularity,
    )


@router.get(
    "/organizations/{organization_id}/analytics/trends",
    response_model=TrendResponse,
)
async def get_organization_trends(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    api_key_id: uuid.UUID | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    granularity: str = Query(default="day", description="Bucket size: 'hour' or 'day'."),
) -> TrendResponse:
    return await service.get_organization_trends(
        db,
        user_id=user.id,
        organization_id=organization_id,
        api_key_id=api_key_id,
        from_=from_,
        to=to,
        granularity=granularity,
    )


@router.get(
    "/projects/{project_id}/events",
    response_model=PaginatedResponse[TenantEventResponse],
)
async def get_project_events(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    status_: EventStatus | None = Query(default=None, alias="status"),
    priority: EventPriority | None = Query(default=None),
    event_type: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
) -> Page[EventView]:
    return await service.get_project_events(
        db,
        user_id=user.id,
        project_id=project_id,
        status=status_,
        priority=priority,
        event_type=event_type,
        from_=from_,
        to=to,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/organizations/{organization_id}/events",
    response_model=PaginatedResponse[TenantEventResponse],
)
async def get_organization_events(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    status_: EventStatus | None = Query(default=None, alias="status"),
    priority: EventPriority | None = Query(default=None),
    event_type: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
) -> Page[EventView]:
    return await service.get_organization_events(
        db,
        user_id=user.id,
        organization_id=organization_id,
        status=status_,
        priority=priority,
        event_type=event_type,
        from_=from_,
        to=to,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/projects/{project_id}/events/{event_id}",
    response_model=TenantEventDetailResponse,
)
async def get_project_event(
    project_id: uuid.UUID,
    event_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> TenantEventDetailResponse:
    detail = await service.get_project_event(
        db, user_id=user.id, project_id=project_id, event_id=event_id
    )
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return TenantEventDetailResponse.model_validate(detail, from_attributes=True)


@router.get(
    "/projects/{project_id}/notifications",
    response_model=PaginatedResponse[TenantNotificationResponse],
)
async def get_project_notifications(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    status_: NotificationStatus | None = Query(default=None, alias="status"),
    channel: NotificationChannel | None = Query(default=None),
    search: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None, alias="to"),
) -> Page[NotificationView]:
    """List delivery instances visible inside one project."""
    return await service.get_project_notifications(
        db,
        user_id=user.id,
        project_id=project_id,
        status=status_,
        channel=channel,
        search=search,
        from_=from_,
        to=to,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/projects/{project_id}/notifications/{notification_id}",
    response_model=TenantNotificationDetailResponse,
)
async def get_project_notification(
    project_id: uuid.UUID,
    notification_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> TenantNotificationDetailResponse:
    """Get one delivery and its complete attempt history."""
    detail = await service.get_project_notification(
        db,
        user_id=user.id,
        project_id=project_id,
        notification_id=notification_id,
    )
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return TenantNotificationDetailResponse.model_validate(detail, from_attributes=True)


@router.post(
    "/projects/{project_id}/notifications/{notification_id}/retry",
    response_model=TenantNotificationDetailResponse,
)
async def retry_project_notification(
    project_id: uuid.UUID,
    notification_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> TenantNotificationDetailResponse:
    """Requeue an active dead-lettered delivery after project authorization."""
    detail = await service.retry_project_notification(
        db, user_id=user.id, project_id=project_id, notification_id=notification_id
    )
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Notification has no active dead letter to retry",
        )
    return TenantNotificationDetailResponse.model_validate(detail, from_attributes=True)


@router.post(
    "/projects/{project_id}/notifications/{notification_id}/discard",
    response_model=TenantNotificationDetailResponse,
)
async def discard_project_notification(
    project_id: uuid.UUID,
    notification_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> TenantNotificationDetailResponse:
    """Acknowledge an active dead letter after project authorization."""
    detail = await service.discard_project_notification(
        db, user_id=user.id, project_id=project_id, notification_id=notification_id
    )
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Notification has no active dead letter to discard",
        )
    return TenantNotificationDetailResponse.model_validate(detail, from_attributes=True)
