"""Celery tasks for best-effort identity and tenancy notification emails."""

import asyncio
import logging
from collections.abc import Callable

from app.core.config import settings
from app.modules.delivery.adapters.email import EmailAdapter
from app.modules.delivery.templates.transactional import (
    TransactionalEmail,
    email_changed_email,
    invitation_accepted_email,
    member_removed_email,
    member_role_changed_email,
    welcome_email,
)
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

NOTIFY_WELCOME = "NOTIFY.WELCOME"
NOTIFY_PRIMARY_EMAIL_CHANGED = "NOTIFY.PRIMARY_EMAIL_CHANGED"
NOTIFY_MEMBER_REMOVED = "NOTIFY.MEMBER_REMOVED"
NOTIFY_MEMBER_ROLE_CHANGED = "NOTIFY.MEMBER_ROLE_CHANGED"
NOTIFY_INVITATION_ACCEPTED = "NOTIFY.INVITATION_ACCEPTED"


def _render_welcome(recipient: str, payload: dict[str, str]) -> TransactionalEmail:
    return welcome_email(
        frontend_url=settings.FRONTEND_URL,
        recipient=recipient,
        recipient_name=payload["recipient_name"],
        workspace_name=payload["workspace_name"],
    )


def _render_primary_email_changed(recipient: str, payload: dict[str, str]) -> TransactionalEmail:
    return email_changed_email(
        frontend_url=settings.FRONTEND_URL,
        recipient=recipient,
        recipient_name=payload["recipient_name"],
        new_email=payload["new_email"],
    )


def _render_member_removed(recipient: str, payload: dict[str, str]) -> TransactionalEmail:
    return member_removed_email(
        frontend_url=settings.FRONTEND_URL,
        recipient=recipient,
        recipient_name=payload["recipient_name"],
        organization_name=payload["organization_name"],
    )


def _render_member_role_changed(recipient: str, payload: dict[str, str]) -> TransactionalEmail:
    return member_role_changed_email(
        frontend_url=settings.FRONTEND_URL,
        recipient=recipient,
        recipient_name=payload["recipient_name"],
        organization_name=payload["organization_name"],
        role=payload["role"],
    )


def _render_invitation_accepted(recipient: str, payload: dict[str, str]) -> TransactionalEmail:
    return invitation_accepted_email(
        frontend_url=settings.FRONTEND_URL,
        recipient=recipient,
        recipient_name=payload["recipient_name"],
        organization_name=payload["organization_name"],
        member_email=payload["member_email"],
        role=payload["role"],
    )


_RENDERERS: dict[str, Callable[[str, dict[str, str]], TransactionalEmail]] = {
    NOTIFY_WELCOME: _render_welcome,
    NOTIFY_PRIMARY_EMAIL_CHANGED: _render_primary_email_changed,
    NOTIFY_MEMBER_REMOVED: _render_member_removed,
    NOTIFY_MEMBER_ROLE_CHANGED: _render_member_role_changed,
    NOTIFY_INVITATION_ACCEPTED: _render_invitation_accepted,
}


async def _send_lifecycle_notification_email(
    recipient: str,
    message: TransactionalEmail,
) -> bool:
    """Send a lifecycle email without allowing provider failures to escape."""
    try:
        result = await asyncio.to_thread(
            EmailAdapter().send,
            recipient,
            message.subject,
            message.html,
            plain_text=message.text,
        )
    except Exception:  # noqa: BLE001 - lifecycle notifications are best-effort
        logger.exception("Lifecycle notification email to %s failed", recipient)
        return False
    if not result.success:
        logger.warning(
            "Lifecycle notification email to %s was not accepted: %s",
            recipient,
            result.error_message,
        )
        return False
    return True


@celery_app.task(name="app.workers.identity_notifications.send_lifecycle_notification")
def send_lifecycle_notification(
    event: str,
    recipient: str,
    payload: dict[str, str],
) -> dict[str, str | bool]:
    """Render and send one best-effort identity or tenancy notification."""
    renderer = _RENDERERS.get(event)
    if renderer is None:
        logger.error("Unknown lifecycle notification event: %s", event)
        return {"event": event, "success": False, "error": "unknown_notification_event"}

    try:
        message = renderer(recipient, payload)
        success = asyncio.run(_send_lifecycle_notification_email(recipient, message))
    except Exception:  # noqa: BLE001 - lifecycle notifications are best-effort
        logger.exception("Lifecycle notification %s failed for %s", event, recipient)
        return {"event": event, "success": False}

    if not success:
        logger.warning(
            "Lifecycle notification %s was not accepted for %s: %s",
            event,
            recipient,
            "provider rejected or failed to deliver",
        )
        return {"event": event, "success": False}

    return {"event": event, "success": True}
