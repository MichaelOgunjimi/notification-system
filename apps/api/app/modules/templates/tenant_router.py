"""Session-auth template endpoints — a project's shared template library.

Every key in a project shares one template pool, so these routes are scoped
to the project (and, for browsing, the organization) rather than to an
individual API key — unlike templates/router.py, which is the api-key
authenticated self-service surface used at send time.
"""

import uuid

from fastapi import APIRouter, Query, Request, status

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.core.pagination import Page
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.notifications.enums import NotificationChannel
from app.modules.observability.audit.service import log_action
from app.modules.templates import service as template_service
from app.modules.templates.model import Template
from app.modules.templates.schemas import TemplateCreate, TemplateResponse, TemplateUpdate
from app.modules.tenancy.authorization import (
    OrganizationCapability,
    authorize_organization,
    authorize_project,
)
from app.modules.tenancy.errors import TenantResourceNotFoundError

router = APIRouter(tags=["tenant-templates"])


@router.get(
    "/projects/{project_id}/templates",
    response_model=PaginatedResponse[TemplateResponse],
)
async def list_project_templates(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    channel: NotificationChannel | None = Query(default=None),
) -> Page[Template]:
    await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_TEMPLATES,
    )
    return await template_service.list_templates_for_project(
        db, project_id=project_id, page=page, per_page=per_page, channel=channel
    )


@router.get(
    "/projects/{project_id}/templates/defaults",
    response_model=PaginatedResponse[TemplateResponse],
)
async def list_project_default_templates(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    channel: NotificationChannel | None = Query(default=None),
) -> Page[Template]:
    await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_TEMPLATES,
    )
    return await template_service.list_system_default_templates(
        db, page=page, per_page=per_page, channel=channel
    )


@router.get(
    "/organizations/{organization_id}/templates",
    response_model=PaginatedResponse[TemplateResponse],
)
async def list_organization_templates(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    channel: NotificationChannel | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
) -> Page[Template]:
    await authorize_organization(
        db,
        user_id=user.id,
        organization_id=organization_id,
        capability=OrganizationCapability.READ_ORGANIZATION_TEMPLATES,
    )
    return await template_service.list_templates_for_organization(
        db,
        organization_id=organization_id,
        page=page,
        per_page=per_page,
        channel=channel,
        project_id=project_id,
    )


@router.get(
    "/organizations/{organization_id}/templates/defaults",
    response_model=PaginatedResponse[TemplateResponse],
)
async def list_organization_default_templates(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    channel: NotificationChannel | None = Query(default=None),
) -> Page[Template]:
    await authorize_organization(
        db,
        user_id=user.id,
        organization_id=organization_id,
        capability=OrganizationCapability.READ_ORGANIZATION_TEMPLATES,
    )
    return await template_service.list_system_default_templates(
        db, page=page, per_page=per_page, channel=channel
    )


@router.post(
    "/projects/{project_id}/templates",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_template(
    project_id: uuid.UUID,
    body: TemplateCreate,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> TemplateResponse:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_TEMPLATES,
    )
    template = await template_service.create_template(db, body, project_id=access.project.id)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="template.created",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"name": template.name, "channel": str(template.channel)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(template)


@router.get("/projects/{project_id}/templates/{template_id}", response_model=TemplateResponse)
async def get_project_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> TemplateResponse:
    await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_TEMPLATES,
    )
    template = await template_service.get_template_for_project(
        db, template_id, project_id=project_id
    )
    if template is None:
        raise TenantResourceNotFoundError("Template")
    return TemplateResponse.model_validate(template)


@router.put("/projects/{project_id}/templates/{template_id}", response_model=TemplateResponse)
async def update_project_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    body: TemplateUpdate,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> TemplateResponse:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_TEMPLATES,
    )
    template = await template_service.get_owned_template(db, template_id, project_id=project_id)
    if template is None:
        raise TenantResourceNotFoundError("Template")

    updated = await template_service.update_template(db, template, body)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="template.updated",
        resource_type="template",
        resource_id=str(updated.id),
        metadata={"name": updated.name, "channel": str(updated.channel)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(updated)


@router.delete(
    "/projects/{project_id}/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_project_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> None:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_TEMPLATES,
    )
    template = await template_service.get_owned_template(db, template_id, project_id=project_id)
    if template is None:
        raise TenantResourceNotFoundError("Template")

    await template_service.soft_delete_template(db, template)
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="template.deleted",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"name": template.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()


@router.post(
    "/projects/{project_id}/templates/{template_id}/fork",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def fork_project_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> TemplateResponse:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_TEMPLATES,
    )
    fork = await template_service.fork_template(
        db, template_id=template_id, project_id=access.project.id
    )
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="template.forked",
        resource_type="template",
        resource_id=str(fork.id),
        metadata={"name": fork.name, "source_template_id": str(template_id)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(fork)
