"""Branded transactional email templates."""

from app.modules.delivery.templates.transactional.messages import (
    email_changed_email,
    email_verification_email,
    invitation_accepted_email,
    magic_link_email,
    member_removed_email,
    member_role_changed_email,
    organization_invitation_email,
    welcome_email,
)
from app.modules.delivery.templates.transactional.models import TransactionalEmail

__all__ = [
    "TransactionalEmail",
    "email_changed_email",
    "email_verification_email",
    "invitation_accepted_email",
    "magic_link_email",
    "member_removed_email",
    "member_role_changed_email",
    "organization_invitation_email",
    "welcome_email",
]
