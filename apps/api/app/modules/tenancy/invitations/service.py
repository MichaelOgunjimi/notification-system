"""Organization invitation lifecycle."""

import asyncio
import secrets
import uuid
from datetime import timedelta
from urllib.parse import quote

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.config import settings
from app.core.crypto import hash_api_key
from app.core.datetime import utc_now
from app.modules.delivery.adapters.email import EmailAdapter
from app.modules.delivery.templates.transactional import organization_invitation_email
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User
from app.modules.observability.audit.service import log_action
from app.modules.tenancy.authorization import OrganizationCapability, authorize_organization
from app.modules.tenancy.invitations.model import OrganizationInvitation
from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def list_invitations(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[OrganizationInvitation]:
    await authorize_organization(
        db,
        user_id=user_id,
        organization_id=organization_id,
        capability=OrganizationCapability.MANAGE_MEMBERS,
    )
    result = await db.execute(
        select(OrganizationInvitation)
        .where(col(OrganizationInvitation.organization_id) == organization_id)
        .order_by(col(OrganizationInvitation.created_at).desc())
    )
    return list(result.scalars().all())


async def create_invitation(
    db: AsyncSession,
    *,
    actor: User,
    organization_id: uuid.UUID,
    email: str,
    role: OrganizationRole,
) -> OrganizationInvitation:
    access = await authorize_organization(
        db,
        user_id=actor.id,
        organization_id=organization_id,
        capability=OrganizationCapability.MANAGE_MEMBERS,
    )
    if role == OrganizationRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Owner access must be granted to an existing member",
        )
    normalized_email = _normalize_email(email)
    existing_user_id = (
        await db.execute(
            select(col(EmailAddress.user_id)).where(col(EmailAddress.email) == normalized_email)
        )
    ).scalar_one_or_none()
    if existing_user_id is not None:
        existing_membership = (
            await db.execute(
                select(col(OrganizationMembership.id)).where(
                    col(OrganizationMembership.organization_id) == organization_id,
                    col(OrganizationMembership.user_id) == existing_user_id,
                )
            )
        ).scalar_one_or_none()
        if existing_membership is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This user is already an organization member",
            )

    raw_token = secrets.token_urlsafe(32)
    invitation = (
        await db.execute(
            select(OrganizationInvitation).where(
                col(OrganizationInvitation.organization_id) == organization_id,
                col(OrganizationInvitation.email) == normalized_email,
            )
        )
    ).scalar_one_or_none()
    now = utc_now()
    if invitation is None:
        invitation = OrganizationInvitation(
            organization_id=organization_id,
            email=normalized_email,
            role=role,
            token_hash=hash_api_key(raw_token),
            invited_by_user_id=actor.id,
            expires_at=now + timedelta(seconds=settings.ORGANIZATION_INVITATION_TTL_SECONDS),
        )
    else:
        invitation.role = role
        invitation.token_hash = hash_api_key(raw_token)
        invitation.invited_by_user_id = actor.id
        invitation.expires_at = now + timedelta(
            seconds=settings.ORGANIZATION_INVITATION_TTL_SECONDS
        )
        invitation.accepted_at = None
        invitation.revoked_at = None
        invitation.updated_at = now
    db.add(invitation)
    await db.flush()
    await log_action(
        db,
        api_key_id=None,
        organization_id=organization_id,
        actor_user_id=actor.id,
        action="organization.invitation_created",
        resource_type="organization_invitation",
        resource_id=str(invitation.id),
        metadata={"email": normalized_email, "role": role},
    )
    await db.commit()

    link = f"{settings.FRONTEND_URL.rstrip('/')}/invitations/accept?token={quote(raw_token)}"
    email_message = organization_invitation_email(
        frontend_url=settings.FRONTEND_URL,
        recipient=normalized_email,
        inviter_name=actor.name,
        organization_name=access.organization.name,
        role=role.value,
        action_url=link,
        expires_days=max(1, settings.ORGANIZATION_INVITATION_TTL_SECONDS // 86400),
    )
    result = await asyncio.to_thread(
        EmailAdapter().send,
        normalized_email,
        email_message.subject,
        email_message.html,
        plain_text=email_message.text,
    )
    if not result.success:
        invitation.revoked_at = utc_now()
        invitation.updated_at = invitation.revoked_at
        db.add(invitation)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to send organization invitation",
        )
    return invitation


async def accept_invitation(
    db: AsyncSession,
    *,
    user: User,
    token: str,
) -> OrganizationMembership:
    invitation = (
        await db.execute(
            select(OrganizationInvitation).where(
                col(OrganizationInvitation.token_hash) == hash_api_key(token)
            )
        )
    ).scalar_one_or_none()
    now = utc_now()
    if (
        invitation is None
        or invitation.accepted_at is not None
        or invitation.revoked_at is not None
        or invitation.expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired organization invitation",
        )
    owns_email = (
        await db.execute(
            select(col(EmailAddress.id)).where(
                col(EmailAddress.user_id) == user.id,
                col(EmailAddress.email) == invitation.email,
                col(EmailAddress.verified_at).is_not(None),
            )
        )
    ).scalar_one_or_none()
    if owns_email is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign in with the verified email address that received this invitation",
        )
    membership = (
        await db.execute(
            select(OrganizationMembership).where(
                col(OrganizationMembership.organization_id) == invitation.organization_id,
                col(OrganizationMembership.user_id) == user.id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        membership = OrganizationMembership(
            organization_id=invitation.organization_id,
            user_id=user.id,
            role=invitation.role,
        )
        db.add(membership)
        await db.flush()
    invitation.accepted_at = now
    invitation.updated_at = now
    db.add(invitation)
    await log_action(
        db,
        api_key_id=None,
        organization_id=invitation.organization_id,
        actor_user_id=user.id,
        action="organization.invitation_accepted",
        resource_type="organization_membership",
        resource_id=str(membership.id),
        metadata={"invitation_id": str(invitation.id), "role": membership.role},
    )
    await db.commit()
    return membership


async def revoke_invitation(
    db: AsyncSession,
    *,
    actor: User,
    organization_id: uuid.UUID,
    invitation_id: uuid.UUID,
) -> None:
    await authorize_organization(
        db,
        user_id=actor.id,
        organization_id=organization_id,
        capability=OrganizationCapability.MANAGE_MEMBERS,
    )
    invitation = (
        await db.execute(
            select(OrganizationInvitation).where(
                col(OrganizationInvitation.id) == invitation_id,
                col(OrganizationInvitation.organization_id) == organization_id,
            )
        )
    ).scalar_one_or_none()
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    invitation.revoked_at = utc_now()
    invitation.updated_at = invitation.revoked_at
    db.add(invitation)
    await log_action(
        db,
        api_key_id=None,
        organization_id=organization_id,
        actor_user_id=actor.id,
        action="organization.invitation_revoked",
        resource_type="organization_invitation",
        resource_id=str(invitation.id),
    )
    await db.commit()
