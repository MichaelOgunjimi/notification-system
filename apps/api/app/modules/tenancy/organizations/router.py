"""Organization HTTP interface."""

import uuid

from fastapi import APIRouter, Query, status

from app.core.http.dependencies import SessionDep
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.tenancy import application
from app.modules.tenancy.schemas import (
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
    ProjectCreate,
    ProjectResponse,
)
from app.modules.tenancy.types import OrganizationView, ProjectView

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationResponse])
async def list_organizations(
    user: CurrentUserDep,
    db: SessionDep,
    include_archived: bool = Query(default=False),
) -> list[OrganizationView]:
    return await application.list_organizations_for_user(
        db,
        user_id=user.id,
        include_archived=include_archived,
    )


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    body: OrganizationCreate, user: CurrentUserDep, db: SessionDep
) -> OrganizationView:
    return await application.create_organization_for_user(
        db,
        user=user,
        name=body.name,
        slug=body.slug,
        description=body.description,
    )


@router.get("/{organization_id}", response_model=OrganizationResponse)
async def get_organization(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> OrganizationView:
    return await application.get_organization_for_user(
        db,
        user_id=user.id,
        organization_id=organization_id,
    )


@router.patch("/{organization_id}", response_model=OrganizationResponse)
async def update_organization(
    organization_id: uuid.UUID,
    body: OrganizationUpdate,
    user: CurrentUserDep,
    db: SessionDep,
) -> OrganizationView:
    return await application.update_organization_for_user(
        db,
        user=user,
        organization_id=organization_id,
        changes=body.model_dump(exclude_unset=True),
    )


@router.delete("/{organization_id}", response_model=OrganizationResponse)
async def archive_organization(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> OrganizationView:
    return await application.archive_organization_for_user(
        db,
        user=user,
        organization_id=organization_id,
    )


@router.get("/{organization_id}/projects", response_model=list[ProjectResponse])
async def list_projects(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    include_archived: bool = Query(default=False),
) -> list[ProjectView]:
    return await application.list_projects_for_user(
        db,
        user_id=user.id,
        organization_id=organization_id,
        include_archived=include_archived,
    )


@router.post(
    "/{organization_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    organization_id: uuid.UUID,
    body: ProjectCreate,
    user: CurrentUserDep,
    db: SessionDep,
) -> ProjectView:
    return await application.create_project_for_user(
        db,
        user=user,
        organization_id=organization_id,
        name=body.name,
        slug=body.slug,
        description=body.description,
    )
