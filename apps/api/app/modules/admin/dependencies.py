"""Resolve scoped platform administrators."""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlmodel import col

from app.core.http.dependencies import SessionDep
from app.modules.admin.types import ROLE_PERMISSIONS, AdminPermission
from app.modules.admin.users.model import AdminUser
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.identity.models.user import User


@dataclass(frozen=True, slots=True)
class AdminPrincipal:
    admin: AdminUser
    user: User
    permissions: frozenset[AdminPermission]


async def get_admin_principal(user: CurrentUserDep, db: SessionDep) -> AdminPrincipal:
    admin = (
        await db.execute(
            select(AdminUser).where(
                col(AdminUser.user_id) == user.id,
                col(AdminUser.is_active).is_(True),
            )
        )
    ).scalar_one_or_none()
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator access required",
        )
    explicit = {
        AdminPermission(permission)
        for permission in admin.permissions
        if permission in AdminPermission._value2member_map_
    }
    return AdminPrincipal(
        admin=admin,
        user=user,
        permissions=ROLE_PERMISSIONS[admin.role] | explicit,
    )


AdminDep = Annotated[AdminPrincipal, Depends(get_admin_principal)]


def require_admin_permission(
    permission: AdminPermission,
) -> Callable[..., Awaitable[AdminPrincipal]]:
    async def require_permission(principal: AdminDep) -> AdminPrincipal:
        if permission not in principal.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Admin permission required: {permission.value}",
            )
        return principal

    return require_permission


HealthAdminDep = Annotated[
    AdminPrincipal,
    Depends(require_admin_permission(AdminPermission.HEALTH_READ)),
]
AnalyticsAdminDep = Annotated[
    AdminPrincipal,
    Depends(require_admin_permission(AdminPermission.ANALYTICS_READ)),
]
AuditAdminDep = Annotated[
    AdminPrincipal,
    Depends(require_admin_permission(AdminPermission.AUDIT_READ)),
]
UsageAdminDep = Annotated[
    AdminPrincipal,
    Depends(require_admin_permission(AdminPermission.USAGE_READ)),
]
ApiKeysAdminDep = Annotated[
    AdminPrincipal,
    Depends(require_admin_permission(AdminPermission.API_KEYS_READ)),
]
TemplatesAdminDep = Annotated[
    AdminPrincipal,
    Depends(require_admin_permission(AdminPermission.TEMPLATES_MANAGE)),
]
AdminsManageDep = Annotated[
    AdminPrincipal,
    Depends(require_admin_permission(AdminPermission.ADMINS_MANAGE)),
]
SystemAccountsManageDep = Annotated[
    AdminPrincipal,
    Depends(require_admin_permission(AdminPermission.SYSTEM_ACCOUNTS_MANAGE)),
]
