"""Organization invitation HTTP interface."""

import uuid

from fastapi import APIRouter, status

from app.core.http.dependencies import SessionDep
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.tenancy.invitations.schemas import (
    OrganizationInvitationAccept,
    OrganizationInvitationCreate,
    OrganizationInvitationResponse,
)
from app.modules.tenancy.invitations.service import (
    accept_invitation,
    create_invitation,
    list_invitations,
    revoke_invitation,
)
from app.modules.tenancy.models.organization import OrganizationMembership

organization_router = APIRouter(
    prefix="/organizations/{organization_id}/invitations",
    tags=["invitations"],
)
acceptance_router = APIRouter(prefix="/invitations", tags=["invitations"])


@organization_router.get("", response_model=list[OrganizationInvitationResponse])
async def get_invitations(
    organization_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
):
    return await list_invitations(db, user_id=user.id, organization_id=organization_id)


@organization_router.post(
    "",
    response_model=OrganizationInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_member(
    organization_id: uuid.UUID,
    body: OrganizationInvitationCreate,
    user: CurrentUserDep,
    db: SessionDep,
):
    return await create_invitation(
        db,
        actor=user,
        organization_id=organization_id,
        email=str(body.email),
        role=body.role,
    )


@organization_router.delete("/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invitation(
    organization_id: uuid.UUID,
    invitation_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> None:
    await revoke_invitation(
        db,
        actor=user,
        organization_id=organization_id,
        invitation_id=invitation_id,
    )


@acceptance_router.post("/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept_organization_invitation(
    body: OrganizationInvitationAccept,
    user: CurrentUserDep,
    db: SessionDep,
) -> None:
    membership: OrganizationMembership = await accept_invitation(
        db,
        user=user,
        token=body.token,
    )
    del membership
