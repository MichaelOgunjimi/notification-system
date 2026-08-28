"""Organization member HTTP interface."""

import uuid

from fastapi import APIRouter, status

from app.core.http.dependencies import SessionDep
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.tenancy.members.schemas import (
    OrganizationMemberResponse,
    OrganizationMemberUpdate,
)
from app.modules.tenancy.members.service import (
    MemberView,
    list_members,
    remove_member,
    update_member_role,
)

router = APIRouter(prefix="/organizations/{organization_id}/members", tags=["members"])


@router.get("", response_model=list[OrganizationMemberResponse])
async def get_members(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> list[MemberView]:
    return await list_members(db, user_id=user.id, organization_id=organization_id)


@router.patch("/{membership_id}", response_model=OrganizationMemberResponse)
async def update_member(
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
    body: OrganizationMemberUpdate,
    user: CurrentUserDep,
    db: SessionDep,
) -> MemberView:
    return await update_member_role(
        db,
        actor=user,
        organization_id=organization_id,
        membership_id=membership_id,
        role=body.role,
    )


@router.delete("/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(
    organization_id: uuid.UUID,
    membership_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> None:
    await remove_member(
        db,
        actor=user,
        organization_id=organization_id,
        membership_id=membership_id,
    )
