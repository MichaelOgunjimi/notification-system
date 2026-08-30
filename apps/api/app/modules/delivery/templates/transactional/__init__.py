"""Branded transactional email templates."""

from app.modules.delivery.templates.transactional.messages import (
    magic_link_email,
    organization_invitation_email,
)
from app.modules.delivery.templates.transactional.models import TransactionalEmail

__all__ = [
    "TransactionalEmail",
    "magic_link_email",
    "organization_invitation_email",
]
