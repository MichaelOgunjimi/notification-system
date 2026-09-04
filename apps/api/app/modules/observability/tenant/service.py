"""Project-scoped and organization-wide audit and usage use cases."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.datetime import to_naive_utc
from app.core.pagination import Page
from app.modules.credentials.model import ApiKey
from app.modules.identity.models.user import User
from app.modules.observability.audit.model import AuditLog
from app.modules.observability.tenant.types import (
    AuditLogView,
    UsageEnvironmentSummary,
    UsageSummaryView,
    UsageView,
)
from app.modules.observability.usage.model import ApiKeyUsage
from app.modules.tenancy.authorization import (
    OrganizationCapability,
    authorize_organization,
    authorize_project,
)
from app.modules.tenancy.models.organization import OrganizationMembership
from app.modules.tenancy.models.project import Project

# Which action namespaces each activity surface shows. The governance audit log is
# "who changed the account"; the operational activity view is "what the integration
# did". Anything outside these prefixes is admin-plane and never tenant-visible.
_CATEGORY_PREFIXES: dict[str, tuple[str, ...]] = {
    "governance": ("organization.", "project.", "api_key."),
    "operational": ("event.", "template.", "scheduled_events.", "notification."),
}


def _usage_query(*, project_id: uuid.UUID | None, organization_id: uuid.UUID | None) -> Any:
    selected: Any = select(
        col(ApiKey.project_id).label("project_id"),
        col(ApiKeyUsage.api_key_id).label("api_key_id"),
        col(ApiKeyUsage.endpoint).label("endpoint"),
        col(ApiKeyUsage.hour_bucket).label("hour_bucket"),
        func.sum(col(ApiKeyUsage.request_count)).label("request_count"),
    ).join(ApiKey, col(ApiKey.id) == col(ApiKeyUsage.api_key_id))
    if organization_id is not None:
        selected = selected.join(Project, col(Project.id) == col(ApiKey.project_id)).where(
            col(Project.organization_id) == organization_id
        )
    elif project_id is not None:
        selected = selected.where(col(ApiKey.project_id) == project_id)
    return selected.group_by(
        col(ApiKey.project_id),
        col(ApiKeyUsage.api_key_id),
        col(ApiKeyUsage.endpoint),
        col(ApiKeyUsage.hour_bucket),
    )


async def _usage_page(
    db: AsyncSession,
    *,
    query: Any,
    page: int,
    per_page: int,
) -> Page[UsageView]:
    total = int(
        (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    )
    result = await db.execute(
        query.order_by(col(ApiKeyUsage.hour_bucket).desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    items = [
        UsageView(
            project_id=row.project_id,
            api_key_id=row.api_key_id,
            endpoint=row.endpoint,
            hour_bucket=row.hour_bucket,
            request_count=int(row.request_count),
        )
        for row in result.all()
    ]
    return Page(items=items, total=total, page=page, per_page=per_page)


async def get_project_usage(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    page: int,
    per_page: int,
) -> Page[UsageView]:
    await authorize_project(
        db,
        user_id=user_id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_USAGE,
    )
    return await _usage_page(
        db,
        query=_usage_query(project_id=project_id, organization_id=None),
        page=page,
        per_page=per_page,
    )


async def get_organization_usage(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    page: int,
    per_page: int,
) -> Page[UsageView]:
    await authorize_organization(
        db,
        user_id=user_id,
        organization_id=organization_id,
        capability=OrganizationCapability.READ_ORGANIZATION_USAGE,
    )
    return await _usage_page(
        db,
        query=_usage_query(project_id=None, organization_id=organization_id),
        page=page,
        per_page=per_page,
    )


async def _usage_summary(
    db: AsyncSession,
    *,
    project_id: uuid.UUID | None,
    organization_id: uuid.UUID | None,
    from_: datetime | None,
    to: datetime | None,
) -> UsageSummaryView:
    filters = []
    if project_id is not None:
        filters.append(col(ApiKey.project_id) == project_id)
    if organization_id is not None:
        filters.append(col(Project.organization_id) == organization_id)
    if from_ is not None:
        filters.append(col(ApiKeyUsage.hour_bucket) >= from_)
    if to is not None:
        filters.append(col(ApiKeyUsage.hour_bucket) <= to)

    result = await db.execute(
        select(
            col(ApiKey.environment).label("environment"),
            func.sum(col(ApiKeyUsage.request_count)).label("total_requests"),
            func.sum(
                case(
                    (col(ApiKeyUsage.status_code) < 400, col(ApiKeyUsage.request_count)),
                    else_=0,
                )
            ).label("successful_requests"),
            func.sum(
                case(
                    (col(ApiKeyUsage.status_code) >= 400, col(ApiKeyUsage.request_count)),
                    else_=0,
                )
            ).label("failed_requests"),
            func.count(func.distinct(col(ApiKey.project_id))).label("project_count"),
            func.count(func.distinct(col(ApiKey.id))).label("api_key_count"),
        )
        .select_from(ApiKeyUsage)
        .join(ApiKey, col(ApiKey.id) == col(ApiKeyUsage.api_key_id))
        .join(Project, col(Project.id) == col(ApiKey.project_id))
        .where(and_(*filters))
        .group_by(col(ApiKey.environment))
        .order_by(col(ApiKey.environment))
    )
    rows = result.all()
    by_environment = [
        UsageEnvironmentSummary(
            environment=row.environment,
            total_requests=int(row.total_requests or 0),
            successful_requests=int(row.successful_requests or 0),
            failed_requests=int(row.failed_requests or 0),
        )
        for row in rows
    ]
    return UsageSummaryView(
        total_requests=sum(item.total_requests for item in by_environment),
        successful_requests=sum(item.successful_requests for item in by_environment),
        failed_requests=sum(item.failed_requests for item in by_environment),
        project_count=sum(int(row.project_count or 0) for row in rows),
        api_key_count=sum(int(row.api_key_count or 0) for row in rows),
        by_environment=by_environment,
    )


async def get_project_usage_summary(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    from_: datetime | None,
    to: datetime | None,
) -> UsageSummaryView:
    await authorize_project(
        db,
        user_id=user_id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_USAGE,
    )
    return await _usage_summary(
        db,
        project_id=project_id,
        organization_id=None,
        from_=from_,
        to=to,
    )


async def get_organization_usage_summary(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    from_: datetime | None,
    to: datetime | None,
) -> UsageSummaryView:
    await authorize_organization(
        db,
        user_id=user_id,
        organization_id=organization_id,
        capability=OrganizationCapability.READ_ORGANIZATION_USAGE,
    )
    return await _usage_summary(
        db,
        project_id=None,
        organization_id=organization_id,
        from_=from_,
        to=to,
    )


def _actor_filter(actor: str | None) -> Any | None:
    """Translate the ``actor`` query value into an optional WHERE clause.

    ``"user"`` / ``"api_key"`` match any entry attributed to that kind of actor;
    a UUID matches that specific user or API key. Anything else is ignored.
    """
    if actor == "user":
        return col(AuditLog.actor_user_id).is_not(None)
    if actor == "api_key":
        return col(AuditLog.api_key_id).is_not(None)
    if not actor:
        return None
    try:
        actor_id = uuid.UUID(actor)
    except ValueError:
        return None
    return or_(
        col(AuditLog.actor_user_id) == actor_id,
        col(AuditLog.api_key_id) == actor_id,
    )


def _category_filter(category: str | None) -> Any | None:
    """Restrict to the action namespaces of one activity surface, or nothing."""
    prefixes = _CATEGORY_PREFIXES.get(category or "")
    if not prefixes:
        return None
    return or_(*(col(AuditLog.action).like(f"{prefix}%") for prefix in prefixes))


async def _audit_page(
    db: AsyncSession,
    *,
    project_id: uuid.UUID | None,
    organization_id: uuid.UUID | None,
    page: int,
    per_page: int,
    action: str | None,
    actor: str | None,
    category: str | None,
    from_: datetime | None,
    to: datetime | None,
) -> Page[AuditLogView]:
    resolved_project_id = func.coalesce(AuditLog.project_id, ApiKey.project_id)
    resolved_organization_id = func.coalesce(AuditLog.organization_id, Project.organization_id)
    filters = []
    if project_id is not None:
        filters.append(resolved_project_id == project_id)
    if organization_id is not None:
        filters.append(resolved_organization_id == organization_id)
    if action:
        filters.append(col(AuditLog.action).ilike(f"%{action}%"))
    actor_clause = _actor_filter(actor)
    if actor_clause is not None:
        filters.append(actor_clause)
    category_clause = _category_filter(category)
    if category_clause is not None:
        filters.append(category_clause)
    if from_:
        # created_at is TIMESTAMP WITHOUT TIME ZONE; drop any offset the client sent.
        filters.append(col(AuditLog.created_at) >= to_naive_utc(from_))
    if to:
        filters.append(col(AuditLog.created_at) <= to_naive_utc(to))

    query: Any = (
        select(
            AuditLog,
            resolved_organization_id.label("organization_id"),
            resolved_project_id.label("project_id"),
            col(User.name).label("actor_name"),
            col(ApiKey.name).label("api_key_name"),
            col(ApiKey.environment).label("api_key_environment"),
            col(OrganizationMembership.role).label("actor_role"),
        )
        .outerjoin(ApiKey, col(ApiKey.id) == col(AuditLog.api_key_id))
        .outerjoin(User, col(User.id) == col(AuditLog.actor_user_id))
        .outerjoin(Project, col(Project.id) == resolved_project_id)
        .outerjoin(
            OrganizationMembership,
            and_(
                col(OrganizationMembership.user_id) == col(AuditLog.actor_user_id),
                col(OrganizationMembership.organization_id) == resolved_organization_id,
            ),
        )
        .where(and_(*filters))
    )
    total = int(
        (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0
    )
    result = await db.execute(
        query.order_by(col(AuditLog.created_at).desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    items = [
        AuditLogView(
            id=audit_log.id,
            organization_id=row_organization_id,
            project_id=row_project_id,
            actor_user_id=audit_log.actor_user_id,
            actor_name=actor_name,
            actor_role=str(actor_role) if actor_role is not None else None,
            api_key_id=audit_log.api_key_id,
            api_key_name=api_key_name,
            api_key_environment=api_key_environment,
            action=audit_log.action,
            resource_type=audit_log.resource_type,
            resource_id=audit_log.resource_id,
            metadata=audit_log.metadata_,
            ip_address=audit_log.ip_address,
            created_at=audit_log.created_at,
        )
        for (
            audit_log,
            row_organization_id,
            row_project_id,
            actor_name,
            api_key_name,
            api_key_environment,
            actor_role,
        ) in result.all()
    ]
    return Page(items=items, total=total, page=page, per_page=per_page)


async def get_project_audit_log(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    page: int,
    per_page: int,
    action: str | None,
    actor: str | None,
    category: str | None,
    from_: datetime | None,
    to: datetime | None,
) -> Page[AuditLogView]:
    await authorize_project(
        db,
        user_id=user_id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_AUDIT,
    )
    return await _audit_page(
        db,
        project_id=project_id,
        organization_id=None,
        page=page,
        per_page=per_page,
        action=action,
        actor=actor,
        category=category,
        from_=from_,
        to=to,
    )


async def get_organization_audit_log(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    page: int,
    per_page: int,
    action: str | None,
    actor: str | None,
    category: str | None,
    from_: datetime | None,
    to: datetime | None,
) -> Page[AuditLogView]:
    await authorize_organization(
        db,
        user_id=user_id,
        organization_id=organization_id,
        capability=OrganizationCapability.READ_ORGANIZATION_AUDIT,
    )
    return await _audit_page(
        db,
        project_id=None,
        organization_id=organization_id,
        page=page,
        per_page=per_page,
        action=action,
        actor=actor,
        category=category,
        from_=from_,
        to=to,
    )
