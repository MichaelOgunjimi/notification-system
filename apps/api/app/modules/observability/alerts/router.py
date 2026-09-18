"""Session-auth alert rule endpoints — a project's own delivery health rules.

Distinct from the deleted api-key-scoped /alerts CRUD: these rules are owned
by a project (matching the same pivot Templates made), not an individual key.
"""

import uuid

from fastapi import APIRouter, Query, Request, status

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.core.pagination import Page
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.observability.alerts import service as alert_service
from app.modules.observability.alerts.model import AlertRule
from app.modules.observability.alerts.schemas import (
    AlertRuleCreate,
    AlertRuleResponse,
    AlertRuleUpdate,
)
from app.modules.observability.audit.service import log_action
from app.modules.tenancy.authorization import OrganizationCapability, authorize_project
from app.modules.tenancy.errors import TenantResourceNotFoundError

router = APIRouter(tags=["tenant-alert-rules"])


@router.get(
    "/projects/{project_id}/alert-rules",
    response_model=PaginatedResponse[AlertRuleResponse],
)
async def list_project_alert_rules(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> Page[AlertRule]:
    await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_DELIVERIES,
    )
    return await alert_service.list_alert_rules_for_project(
        db, project_id=project_id, page=page, per_page=per_page
    )


@router.post(
    "/projects/{project_id}/alert-rules",
    response_model=AlertRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_alert_rule(
    project_id: uuid.UUID,
    body: AlertRuleCreate,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> AlertRuleResponse:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_DELIVERIES,
    )
    rule = await alert_service.create_alert_rule(db, body, project_id=access.project.id)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="alert_rule.created",
        resource_type="alert_rule",
        resource_id=str(rule.id),
        metadata={"name": rule.name, "metric": str(rule.metric)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return AlertRuleResponse.model_validate(rule)


@router.put(
    "/projects/{project_id}/alert-rules/{rule_id}",
    response_model=AlertRuleResponse,
)
async def update_project_alert_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    body: AlertRuleUpdate,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> AlertRuleResponse:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_DELIVERIES,
    )
    rule = await alert_service.get_project_alert_rule(db, rule_id, project_id=project_id)
    if rule is None:
        raise TenantResourceNotFoundError("Alert rule")

    updated = await alert_service.update_alert_rule(db, rule, body)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="alert_rule.updated",
        resource_type="alert_rule",
        resource_id=str(updated.id),
        metadata={"name": updated.name, "metric": str(updated.metric)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return AlertRuleResponse.model_validate(updated)


@router.delete(
    "/projects/{project_id}/alert-rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_project_alert_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> None:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_DELIVERIES,
    )
    rule = await alert_service.get_project_alert_rule(db, rule_id, project_id=project_id)
    if rule is None:
        raise TenantResourceNotFoundError("Alert rule")

    await alert_service.delete_alert_rule(db, rule)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="alert_rule.deleted",
        resource_type="alert_rule",
        resource_id=str(rule.id),
        metadata={"name": rule.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
