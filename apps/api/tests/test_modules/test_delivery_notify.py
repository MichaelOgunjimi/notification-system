"""Tests for queued identity and tenancy notification wrappers."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.modules.delivery import notify


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("event", "call"),
    [
        (
            "NOTIFY.WELCOME",
            lambda: notify.welcome(email="new@example.com", name="New Person"),
        ),
        (
            "NOTIFY.PRIMARY_EMAIL_CHANGED",
            lambda: notify.primary_email_changed(
                "old@example.com", new_email="new@example.com", name="Person"
            ),
        ),
        (
            "NOTIFY.MEMBER_REMOVED",
            lambda: notify.member_removed(
                SimpleNamespace(email="member@example.com", name="Member"),
                organization=SimpleNamespace(name="Acme"),
            ),
        ),
        (
            "NOTIFY.MEMBER_ROLE_CHANGED",
            lambda: notify.member_role_changed(
                SimpleNamespace(email="member@example.com", name="Member"),
                organization=SimpleNamespace(name="Acme"),
                role="admin",
            ),
        ),
        (
            "NOTIFY.INVITATION_ACCEPTED",
            lambda: notify.invitation_accepted(
                SimpleNamespace(email="inviter@example.com", name="Inviter"),
                organization=SimpleNamespace(name="Acme"),
                member_email="member@example.com",
                role="member",
            ),
        ),
    ],
)
async def test_lifecycle_notification_wrapper_enqueues_primitive_payload(event: str, call) -> None:
    with patch.object(notify.send_lifecycle_notification, "apply_async") as enqueue:
        await call()

    enqueue.assert_called_once()
    args = enqueue.call_args.kwargs["args"]
    assert args[0] == event
    assert isinstance(args[1], str)
    assert isinstance(args[2], dict)
    assert all(isinstance(key, str) and isinstance(value, str) for key, value in args[2].items())
    assert enqueue.call_args.kwargs["queue"] == "notifications.email.lifecycle"
