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

import logging
from typing import cast

from celery import Task

from app.modules.identity.models.user import User
from app.modules.tenancy.models.organization import Organization
from app.workers.identity_notifications import (
    NOTIFY_ALERT_TRIGGERED,
    NOTIFY_INVITATION_ACCEPTED,
    NOTIFY_MEMBER_REMOVED,
    NOTIFY_MEMBER_ROLE_CHANGED,
    NOTIFY_PRIMARY_EMAIL_CHANGED,
    NOTIFY_WELCOME,
    send_lifecycle_notification,
)

logger = logging.getLogger(__name__)


def _enqueue_lifecycle_notification(
    event: str,
    recipient: str,
    payload: dict[str, str],
) -> None:
    """Queue a best-effort lifecycle notification without passing ORM objects."""
    try:
        cast(Task, send_lifecycle_notification).apply_async(
            args=[event, recipient, payload],
            queue="notifications.email.lifecycle",
        )
    except Exception:  # noqa: BLE001 - lifecycle notifications are best-effort
        logger.exception("Unable to queue lifecycle notification %s for %s", event, recipient)


async def welcome(*, email: str, name: str) -> None:
    """A new account (+ its first workspace) was just created."""
    _enqueue_lifecycle_notification(
        NOTIFY_WELCOME,
        email,
        {"recipient_name": name, "workspace_name": f"{name}'s Workspace"},
    )


async def primary_email_changed(previous_email: str, *, new_email: str, name: str) -> None:
    """The account's primary address changed. Goes to the address losing control."""
    _enqueue_lifecycle_notification(
        NOTIFY_PRIMARY_EMAIL_CHANGED,
        previous_email,
        {"recipient_name": name, "new_email": new_email},
    )


async def member_removed(member: User, *, organization: Organization) -> None:
    """``member`` was removed from ``organization``."""
    _enqueue_lifecycle_notification(
        NOTIFY_MEMBER_REMOVED,
        member.email,
        {"recipient_name": member.name, "organization_name": organization.name},
    )


async def member_role_changed(member: User, *, organization: Organization, role: str) -> None:
    """``member``'s role in ``organization`` changed to ``role``."""
    _enqueue_lifecycle_notification(
        NOTIFY_MEMBER_ROLE_CHANGED,
        member.email,
        {"recipient_name": member.name, "organization_name": organization.name, "role": role},
    )


def alert_triggered(
    *,
    recipient: str,
    rule_name: str,
    project_name: str,
    metric_label: str,
    observed_value: str,
    threshold_value: str,
    window_minutes: int,
) -> None:
    """A project's alert rule crossed its threshold.

    Not ``async`` like the rest of this module — its only caller is the sync
    Celery evaluator task, which has nothing to await.
    """
    _enqueue_lifecycle_notification(
        NOTIFY_ALERT_TRIGGERED,
        recipient,
        {
            "rule_name": rule_name,
            "project_name": project_name,
            "metric_label": metric_label,
            "observed_value": observed_value,
            "threshold_value": threshold_value,
            "window_minutes": str(window_minutes),
        },
    )


async def invitation_accepted(
    inviter: User,
    *,
    organization: Organization,
    member_email: str,
    role: str,
) -> None:
    """``member_email`` accepted ``inviter``'s invitation to ``organization``."""
    _enqueue_lifecycle_notification(
        NOTIFY_INVITATION_ACCEPTED,
        inviter.email,
        {
            "recipient_name": inviter.name,
            "organization_name": organization.name,
            "member_email": member_email,
            "role": role,
        },
    )
