"""Project HTTP interface."""

import uuid

from fastapi import APIRouter

from app.core.http.dependencies import SessionDep
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.tenancy import application
from app.modules.tenancy.schemas import ProjectResponse, ProjectUpdate
from app.modules.tenancy.types import ProjectView

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> ProjectView:
    return await application.get_project_for_user(db, user_id=user.id, project_id=project_id)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    user: CurrentUserDep,
    db: SessionDep,
) -> ProjectView:
    return await application.update_project_for_user(
        db,
        user=user,
        project_id=project_id,
        changes=body.model_dump(exclude_unset=True),
    )


@router.delete("/{project_id}", response_model=ProjectResponse)
async def archive_project(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> ProjectView:
    return await application.archive_project_for_user(db, user=user, project_id=project_id)
