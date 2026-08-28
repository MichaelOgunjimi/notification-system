"""Organization membership lifecycle."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.datetime import utc_now
from app.modules.identity.models.user import User
from app.modules.observability.audit.service import log_action
from app.modules.tenancy.authorization import OrganizationCapability, authorize_organization
from app.modules.tenancy.errors import TenantResourceNotFoundError
from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole


@dataclass(frozen=True, slots=True)
class MemberView:
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    name: str
    role: OrganizationRole
    joined_at: datetime


def _member_view(membership: OrganizationMembership, user: User) -> MemberView:
    return MemberView(
        id=membership.id,
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=membership.role,
        joined_at=membership.joined_at,
    )


async def list_members(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[MemberView]:
    await authorize_organization(
        db,
        user_id=user_id,
        organization_id=organization_id,
        capability=OrganizationCapability.READ,
    )
    rows = await db.execute(
        select(OrganizationMembership, User)
        .join(User, col(User.id) == col(OrganizationMembership.user_id))
        .where(col(OrganizationMembership.organization_id) == organization_id)
        .order_by(col(OrganizationMembership.joined_at), col(OrganizationMembership.id))
    )
    return [_member_view(membership, member) for membership, member in rows.all()]


async def _get_membership(
    db: AsyncSession,
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
) -> OrganizationMembership:
    membership = (
        await db.execute(
            select(OrganizationMembership).where(
                col(OrganizationMembership.id) == membership_id,
                col(OrganizationMembership.organization_id) == organization_id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise TenantResourceNotFoundError("Organization member")
    return membership


async def _owner_count(db: AsyncSession, organization_id: uuid.UUID) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(OrganizationMembership)
                .where(
                    col(OrganizationMembership.organization_id) == organization_id,
                    col(OrganizationMembership.role) == OrganizationRole.OWNER,
                )
            )
        ).scalar()
        or 0
    )


async def update_member_role(
    db: AsyncSession,
    *,
    actor: User,
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
    role: OrganizationRole,
) -> MemberView:
    access = await authorize_organization(
        db,
        user_id=actor.id,
        organization_id=organization_id,
        capability=OrganizationCapability.MANAGE_MEMBERS,
    )
    membership = await _get_membership(db, organization_id, membership_id)
    if role == OrganizationRole.OWNER and access.membership.role != OrganizationRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can add owners",
        )
    if (
        membership.role == OrganizationRole.OWNER
        and role != OrganizationRole.OWNER
        and await _owner_count(db, organization_id) == 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The final organization owner cannot be demoted",
        )
    previous_role = membership.role
    membership.role = role
    membership.updated_at = utc_now()
    db.add(membership)
    await log_action(
        db,
        api_key_id=None,
        organization_id=organization_id,
        actor_user_id=actor.id,
        action="organization.member_role_updated",
        resource_type="organization_membership",
        resource_id=str(membership.id),
        metadata={"user_id": str(membership.user_id), "from": previous_role, "to": role},
    )
    member = await db.get(User, membership.user_id)
    assert member is not None
    await db.commit()
    return _member_view(membership, member)


async def remove_member(
    db: AsyncSession,
    *,
    actor: User,
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
) -> None:
    access = await authorize_organization(
        db,
        user_id=actor.id,
        organization_id=organization_id,
        capability=OrganizationCapability.MANAGE_MEMBERS,
    )
    membership = await _get_membership(db, organization_id, membership_id)
    if membership.role == OrganizationRole.OWNER:
        if access.membership.role != OrganizationRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners can remove owners",
            )
        if await _owner_count(db, organization_id) == 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The final organization owner cannot be removed",
            )
    await log_action(
        db,
        api_key_id=None,
        organization_id=organization_id,
        actor_user_id=actor.id,
        action="organization.member_removed",
        resource_type="organization_membership",
        resource_id=str(membership.id),
        metadata={"user_id": str(membership.user_id), "role": membership.role},
    )
    await db.delete(membership)
    await db.commit()
