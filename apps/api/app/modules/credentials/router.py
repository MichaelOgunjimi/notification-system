"""Credential module HTTP interface."""

import uuid
from typing import Literal

from fastapi import APIRouter, Query, status

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.core.pagination import Page
from app.modules.credentials.schemas import (
    CreatedProjectApiKeyResponse,
    ProjectApiKeyCreate,
    ProjectApiKeyResponse,
    ProjectApiKeyUpdate,
)
from app.modules.credentials.service import (
    create_project_api_key,
    list_project_api_keys,
    revoke_project_api_key,
    rotate_project_api_key,
    update_project_api_key,
)
from app.modules.credentials.types import ApiKeyView, CreatedApiKeyView
from app.modules.identity.dependencies import CurrentUserDep

router = APIRouter(prefix="/projects/{project_id}/api-keys", tags=["project-api-keys"])


@router.post("", response_model=CreatedProjectApiKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    project_id: uuid.UUID,
    body: ProjectApiKeyCreate,
    user: CurrentUserDep,
    db: SessionDep,
) -> CreatedApiKeyView:
    return await create_project_api_key(
        db,
        user=user,
        project_id=project_id,
        name=body.name,
        description=body.description,
        scopes=[scope.value for scope in body.scopes],
        rate_limit_per_min=body.rate_limit_per_min,
        environment=body.environment,
    )


@router.get("", response_model=PaginatedResponse[ProjectApiKeyResponse])
async def list_api_keys(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    environment: Literal["test", "live"] | None = Query(default=None),
    status: Literal["active", "revoked"] | None = Query(default=None),
) -> Page[ApiKeyView]:
    return await list_project_api_keys(
        db,
        user_id=user.id,
        project_id=project_id,
        page=page,
        per_page=per_page,
        environment=environment,
        status=status,
    )


@router.delete("/{api_key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    project_id: uuid.UUID,
    api_key_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> None:
    await revoke_project_api_key(
        db,
        user=user,
        project_id=project_id,
        api_key_id=api_key_id,
    )


@router.patch("/{api_key_id}", response_model=ProjectApiKeyResponse)
async def update_api_key(
    project_id: uuid.UUID,
    api_key_id: uuid.UUID,
    body: ProjectApiKeyUpdate,
    user: CurrentUserDep,
    db: SessionDep,
) -> ApiKeyView:
    changes = body.model_dump(exclude_unset=True)
    if body.scopes is not None:
        changes["scopes"] = [scope.value for scope in body.scopes]
    return await update_project_api_key(
        db,
        user=user,
        project_id=project_id,
        api_key_id=api_key_id,
        changes=changes,
    )


@router.post("/{api_key_id}/rotate", response_model=CreatedProjectApiKeyResponse)
async def rotate_api_key(
    project_id: uuid.UUID,
    api_key_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> CreatedApiKeyView:
    return await rotate_project_api_key(
        db,
        user=user,
        project_id=project_id,
        api_key_id=api_key_id,
    )
