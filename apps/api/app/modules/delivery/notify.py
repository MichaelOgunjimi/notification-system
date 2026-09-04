"""Lifecycle notification emails, addressed as domain events.

Each function here names one thing that happened in the product and sends the
matching branded email **best-effort**: a provider failure is logged and
swallowed, never raised, because the triggering action has already committed.

Call sites read as the event, not the plumbing —
``await notify.member_removed(member, organization=org)`` — and every lifecycle
email the app sends is found by grepping ``notify.``. The must-succeed sends
(magic link, email verification, organization invitation) deliberately do **not**
live here; they raise on failure and stay inline in their services.
"""

from app.core.config import settings
from app.modules.delivery.notifications import send_notification_email
from app.modules.delivery.templates.transactional import (
    email_changed_email,
    invitation_accepted_email,
    member_removed_email,
    member_role_changed_email,
    welcome_email,
)
from app.modules.identity.models.user import User
from app.modules.tenancy.models.organization import Organization


async def welcome(*, email: str, name: str) -> None:
    """A new account (+ its first workspace) was just created."""
    await send_notification_email(
        email,
        welcome_email(
            frontend_url=settings.FRONTEND_URL,
            recipient=email,
            recipient_name=name,
            workspace_name=f"{name}'s Workspace",
        ),
    )


async def primary_email_changed(previous_email: str, *, new_email: str, name: str) -> None:
    """The account's primary address changed. Goes to the address losing control."""
    await send_notification_email(
        previous_email,
        email_changed_email(
            frontend_url=settings.FRONTEND_URL,
            recipient=previous_email,
            recipient_name=name,
            new_email=new_email,
        ),
    )


async def member_removed(member: User, *, organization: Organization) -> None:
    """``member`` was removed from ``organization``."""
    await send_notification_email(
        member.email,
        member_removed_email(
            frontend_url=settings.FRONTEND_URL,
            recipient=member.email,
            recipient_name=member.name,
            organization_name=organization.name,
        ),
    )


async def member_role_changed(member: User, *, organization: Organization, role: str) -> None:
    """``member``'s role in ``organization`` changed to ``role``."""
    await send_notification_email(
        member.email,
        member_role_changed_email(
            frontend_url=settings.FRONTEND_URL,
            recipient=member.email,
            recipient_name=member.name,
            organization_name=organization.name,
            role=role,
        ),
    )


async def invitation_accepted(
    inviter: User,
    *,
    organization: Organization,
    member_email: str,
    role: str,
) -> None:
    """``member_email`` accepted ``inviter``'s invitation to ``organization``."""
    await send_notification_email(
        inviter.email,
        invitation_accepted_email(
            frontend_url=settings.FRONTEND_URL,
            recipient=inviter.email,
            recipient_name=inviter.name,
            organization_name=organization.name,
            member_email=member_email,
            role=role,
        ),
    )
