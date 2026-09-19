"""Tests for queued identity and tenancy lifecycle notification emails."""

from unittest.mock import AsyncMock, patch

from app.workers.identity_notifications import send_lifecycle_notification


def test_welcome_notification_renders_and_sends() -> None:
    with patch(
        "app.workers.identity_notifications._send_lifecycle_notification_email",
        new_callable=AsyncMock,
        return_value=True,
    ) as send:
        result = send_lifecycle_notification.run(
            "NOTIFY.WELCOME",
            "new@example.com",
            {
                "recipient_name": "New Person",
                "workspace_name": "New Person's Workspace",
            },
        )

    assert result == {"event": "NOTIFY.WELCOME", "success": True}
    send.assert_called_once()
    recipient, message = send.call_args.args
    assert recipient == "new@example.com"
    assert message.subject == "Welcome to Beaco"
    assert "New Person" in message.html


def test_notification_provider_failure_returns_false() -> None:
    with patch(
        "app.workers.identity_notifications._send_lifecycle_notification_email",
        new_callable=AsyncMock,
        return_value=False,
    ) as send:
        result = send_lifecycle_notification.run(
            "NOTIFY.MEMBER_REMOVED",
            "member@example.com",
            {"recipient_name": "Member", "organization_name": "Acme"},
        )

    assert result == {"event": "NOTIFY.MEMBER_REMOVED", "success": False}
    send.assert_called_once()


def test_unknown_notification_event_is_not_sent() -> None:
    with patch("app.workers.identity_notifications._send_lifecycle_notification_email") as send:
        result = send_lifecycle_notification.run(
            "NOTIFY.UNKNOWN",
            "member@example.com",
            {},
        )

    assert result == {
        "event": "NOTIFY.UNKNOWN",
        "success": False,
        "error": "unknown_notification_event",
    }
    send.assert_not_called()
