"""Platform administrator HTTP interface."""

import uuid

from fastapi import APIRouter, status

from app.core.http.dependencies import SessionDep
from app.modules.admin.dependencies import AdminsManageDep
from app.modules.admin.users.schemas import AdminUserCreate, AdminUserResponse, AdminUserUpdate
from app.modules.admin.users.service import (
    AdminUserView,
    create_admin_user,
    list_admin_users,
    update_admin_user,
)

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


@router.get("", response_model=list[AdminUserResponse])
async def get_admin_users(db: SessionDep, _: AdminsManageDep) -> list[AdminUserView]:
    return await list_admin_users(db)


@router.post("", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
async def add_admin_user(
    body: AdminUserCreate,
    db: SessionDep,
    actor: AdminsManageDep,
) -> AdminUserView:
    return await create_admin_user(
        db,
        actor=actor,
        email=str(body.email),
        role=body.role,
        permissions=[permission.value for permission in body.permissions],
    )


@router.patch("/{admin_user_id}", response_model=AdminUserResponse)
async def edit_admin_user(
    admin_user_id: uuid.UUID,
    body: AdminUserUpdate,
    db: SessionDep,
    actor: AdminsManageDep,
) -> AdminUserView:
    changes = body.model_dump(exclude_unset=True)
    if body.permissions is not None:
        changes["permissions"] = [permission.value for permission in body.permissions]
    return await update_admin_user(
        db,
        actor=actor,
        admin_user_id=admin_user_id,
        changes=changes,
    )
