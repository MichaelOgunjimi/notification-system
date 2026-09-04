"""HTTP adapter for project and organization observability."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Query

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.core.pagination import Page
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.observability.tenant import service
from app.modules.observability.tenant.schemas import (
    TenantAuditLogResponse,
    TenantUsageEndpointResponse,
    TenantUsageHourlyPointResponse,
    TenantUsageResponse,
    TenantUsageSummaryResponse,
)
from app.modules.observability.tenant.types import (
    AuditLogView,
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
