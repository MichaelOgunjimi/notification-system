"""Presentation tests for account and organization transactional emails."""

from app.modules.delivery.templates.transactional import (
    magic_link_email,
    organization_invitation_email,
)


def test_magic_link_email_has_branded_assets_dark_mode_and_plain_text() -> None:
    message = magic_link_email(
        frontend_url="https://beaco.test",
        recipient="maya@example.com",
        recipient_name="Maya",
        action_url="https://beaco.test/auth/magic-link?token=secret",
        expires_minutes=15,
    )

    assert message.subject == "Your private link to Beaco"
    assert 'name="color-scheme" content="light dark"' in message.html
    assert "@media (prefers-color-scheme: dark)" in message.html
    assert "beaco-lockup-horizontal-dark.png" in message.html
    assert "beaco-mark-on-light.png" in message.html
    assert "beaco-mark-128.png" in message.html
    assert 'class="email-mark-light"' in message.html
    assert 'class="email-mark-dark"' in message.html
    assert ".email-mark-light { display:none !important" in message.html
    assert ".email-mark-dark { display:block !important" in message.html
    assert "grid" not in message.html.lower()
    assert "https://beaco.test/auth/magic-link?token=secret" in message.text


def test_invitation_email_escapes_dynamic_identity_values() -> None:
    message = organization_invitation_email(
        frontend_url="https://beaco.test",
        recipient="invitee@example.com",
        inviter_name='<script>alert("x")</script>',
        organization_name="North & South",
        role="organization_admin",
        action_url="https://beaco.test/invitations/accept?token=secret&next=1",
        expires_days=7,
    )

    assert message.subject == "Join North & South on Beaco"
    assert "<script>" not in message.html
    assert "&lt;script&gt;" in message.html
    assert "North &amp; South" in message.html
    assert "token=secret&amp;next=1" in message.html
    assert "Organization Admin" in message.html
