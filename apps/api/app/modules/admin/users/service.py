"""Platform administrator lifecycle."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.datetime import utc_now
from app.modules.admin.dependencies import AdminPrincipal
from app.modules.admin.types import AdminRole
from app.modules.admin.users.model import AdminUser
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User
from app.modules.observability.audit.service import log_action


@dataclass(frozen=True, slots=True)
class AdminUserView:
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    name: str
    role: AdminRole
    permissions: list[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


def _view(admin: AdminUser, user: User) -> AdminUserView:
    return AdminUserView(
        id=admin.id,
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=admin.role,
        permissions=admin.permissions,
        is_active=admin.is_active,
        created_at=admin.created_at,
        updated_at=admin.updated_at,
    )


async def list_admin_users(db: AsyncSession) -> list[AdminUserView]:
    rows = await db.execute(
        select(AdminUser, User)
        .join(User, col(User.id) == col(AdminUser.user_id))
        .order_by(col(AdminUser.created_at), col(AdminUser.id))
    )
    return [_view(admin, user) for admin, user in rows.all()]


async def create_admin_user(
    db: AsyncSession,
    *,
    actor: AdminPrincipal,
    email: str,
    role: AdminRole,
    permissions: list[str],
) -> AdminUserView:
    normalized = email.lower()
    user = (
        await db.execute(
            select(User)
            .join(EmailAddress, col(EmailAddress.user_id) == col(User.id))
            .where(
                col(EmailAddress.email) == normalized,
                col(EmailAddress.verified_at).is_not(None),
            )
        )
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A verified user with this email was not found",
        )
    existing = (
        await db.execute(select(AdminUser).where(col(AdminUser.user_id) == user.id))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already an admin")
    admin = AdminUser(
        user_id=user.id,
        role=role,
        permissions=permissions,
        created_by_admin_user_id=actor.admin.id,
    )
    db.add(admin)
    await db.flush()
    await log_action(
        db,
        api_key_id=None,
        actor_user_id=actor.user.id,
        action="admin_user.created",
        resource_type="admin_user",
        resource_id=str(admin.id),
        metadata={"user_id": str(user.id), "role": role.value, "permissions": permissions},
    )
    await db.commit()
    return _view(admin, user)


async def update_admin_user(
    db: AsyncSession,
    *,
    actor: AdminPrincipal,
    admin_user_id: uuid.UUID,
    changes: dict[str, object],
) -> AdminUserView:
    admin = await db.get(AdminUser, admin_user_id)
    if admin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    removes_super_admin = admin.role == AdminRole.SUPER_ADMIN and (
        changes.get("role", admin.role) != AdminRole.SUPER_ADMIN
        or changes.get("is_active") is False
    )
    if removes_super_admin:
        count = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(AdminUser)
                    .where(
                        col(AdminUser.role) == AdminRole.SUPER_ADMIN,
                        col(AdminUser.is_active).is_(True),
                    )
                )
            ).scalar()
            or 0
        )
        if count == 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The final active super administrator cannot be disabled",
            )
    for field, value in changes.items():
        setattr(admin, field, value)
    admin.updated_at = utc_now()
    db.add(admin)
    await log_action(
        db,
        api_key_id=None,
        actor_user_id=actor.user.id,
        action="admin_user.updated",
        resource_type="admin_user",
        resource_id=str(admin.id),
        metadata={
            "changes": {
                key: value.value if isinstance(value, AdminRole) else value
                for key, value in changes.items()
            }
        },
    )
    user = await db.get(User, admin.user_id)
    assert user is not None
    await db.commit()
    return _view(admin, user)
