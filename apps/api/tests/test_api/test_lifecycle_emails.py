"""Lifecycle notification emails: rendering and best-effort dispatch."""

from unittest.mock import patch

from app.modules.delivery.adapters.base import DeliveryResult
from app.modules.delivery.notifications import send_notification_email
from app.modules.delivery.templates.transactional import (
    email_changed_email,
    invitation_accepted_email,
    member_removed_email,
    member_role_changed_email,
    welcome_email,
)

FRONTEND = "https://app.example.com"


def test_welcome_email_renders_with_a_workspace_call_to_action() -> None:
    message = welcome_email(
        frontend_url=FRONTEND,
        recipient="new@example.com",
        recipient_name="New Person",
        workspace_name="Northwind Workspace",
    )
    assert message.subject
    assert "Northwind Workspace" in message.html
    assert "Northwind Workspace" in message.text
    assert f"{FRONTEND}/workspace" in message.html
    assert f"{FRONTEND}/workspace" in message.text


def test_email_changed_email_names_the_new_address() -> None:
    message = email_changed_email(
        frontend_url=FRONTEND,
        recipient="old@example.com",
        recipient_name="Person",
        new_email="new@example.com",
    )
    assert "new@example.com" in message.html
    assert "new@example.com" in message.text
    # The security fallback link points somewhere the recipient can still reach.
    assert f"{FRONTEND}/login" in message.html


def test_member_removed_email_names_the_organization() -> None:
    message = member_removed_email(
        frontend_url=FRONTEND,
        recipient="member@example.com",
        recipient_name="Member",
        organization_name="Acme",
    )
    assert "Acme" in message.html
    assert "Acme" in message.text


def test_member_role_changed_email_names_the_new_role() -> None:
    message = member_role_changed_email(
        frontend_url=FRONTEND,
        recipient="member@example.com",
        recipient_name="Member",
        organization_name="Acme",
        role="admin",
    )
    assert "Acme" in message.html
    assert "Admin" in message.html or "admin" in message.html


def test_invitation_accepted_email_names_the_new_member() -> None:
    message = invitation_accepted_email(
        frontend_url=FRONTEND,
        recipient="inviter@example.com",
        recipient_name="Inviter",
        organization_name="Acme",
        member_email="joiner@example.com",
        role="member",
    )
    assert "joiner@example.com" in message.html
    assert "Acme" in message.html


async def test_send_notification_email_returns_true_on_success() -> None:
    message = member_removed_email(
        frontend_url=FRONTEND,
        recipient="member@example.com",
        recipient_name="Member",
        organization_name="Acme",
    )
    with patch(
        "app.modules.delivery.notifications.EmailAdapter.send",
        return_value=DeliveryResult(success=True),
    ):
        assert await send_notification_email("member@example.com", message) is True


async def test_send_notification_email_swallows_a_provider_failure() -> None:
    message = member_removed_email(
        frontend_url=FRONTEND,
        recipient="member@example.com",
        recipient_name="Member",
        organization_name="Acme",
    )
    with patch(
        "app.modules.delivery.notifications.EmailAdapter.send",
        return_value=DeliveryResult(success=False, error_message="smtp down"),
    ):
        assert await send_notification_email("member@example.com", message) is False


async def test_send_notification_email_swallows_an_unexpected_error() -> None:
    message = welcome_email(
        frontend_url=FRONTEND,
        recipient="new@example.com",
        recipient_name="New",
        workspace_name="New's Workspace",
    )
    with patch(
        "app.modules.delivery.notifications.EmailAdapter.send",
        side_effect=RuntimeError("boom"),
    ):
        assert await send_notification_email("new@example.com", message) is False
