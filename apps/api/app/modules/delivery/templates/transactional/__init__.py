"""Branded transactional email templates."""

from app.modules.delivery.templates.transactional.messages import (
    email_verification_email,
    magic_link_email,
    organization_invitation_email,
)
from app.modules.delivery.templates.transactional.models import TransactionalEmail

__all__ = [
    "TransactionalEmail",
    "email_verification_email",
    "magic_link_email",
    "organization_invitation_email",
]
