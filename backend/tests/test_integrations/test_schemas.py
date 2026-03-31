"""Tests for Pydantic schema validators (email, phone, webhook_url, event_type)."""

import pytest
from pydantic import ValidationError

from app.schemas.events import EventCreate, RecipientCreate


class TestRecipientValidation:
    """Validates field-level constraints on RecipientCreate."""

    def test_valid_email(self):
        r = RecipientCreate(channels=["email"], email="user@example.com")
        assert r.email == "user@example.com"

    def test_invalid_email_no_at(self):
        with pytest.raises(ValidationError, match="email"):
            RecipientCreate(channels=["email"], email="not-an-email")

    def test_invalid_email_no_domain(self):
        with pytest.raises(ValidationError, match="email"):
            RecipientCreate(channels=["email"], email="user@")

    def test_valid_phone(self):
        r = RecipientCreate(channels=["sms"], phone="+15551234567")
        assert r.phone == "+15551234567"

    def test_invalid_phone_no_plus(self):
        with pytest.raises(ValidationError, match="E.164"):
            RecipientCreate(channels=["sms"], phone="15551234567")

    def test_invalid_phone_too_short(self):
        with pytest.raises(ValidationError, match="E.164"):
            RecipientCreate(channels=["sms"], phone="+1")

    def test_valid_webhook_url(self):
        r = RecipientCreate(channels=["webhook"], webhook_url="https://example.com/hook")
        assert r.webhook_url == "https://example.com/hook"

    def test_invalid_webhook_url_ftp(self):
        with pytest.raises(ValidationError, match="http"):
            RecipientCreate(channels=["webhook"], webhook_url="ftp://example.com/hook")

    def test_invalid_webhook_url_no_host(self):
        with pytest.raises(ValidationError, match="hostname"):
            RecipientCreate(channels=["webhook"], webhook_url="http:///path")

    def test_private_ip_webhook_url_rejected(self):
        with pytest.raises(ValidationError, match="private"):
            RecipientCreate(channels=["webhook"], webhook_url="http://127.0.0.1/hook")

    def test_private_ip_10_rejected(self):
        with pytest.raises(ValidationError, match="private"):
            RecipientCreate(channels=["webhook"], webhook_url="http://10.0.0.1/hook")

    def test_link_local_ip_rejected(self):
        with pytest.raises(ValidationError, match="private"):
            RecipientCreate(channels=["webhook"], webhook_url="http://169.254.169.254/metadata")

    def test_none_fields_allowed(self):
        """None values should pass — only validated when provided."""
        r = RecipientCreate(channels=["email"], email=None, phone=None, webhook_url=None)
        assert r.email is None
        assert r.phone is None
        assert r.webhook_url is None


class TestEventCreateValidation:
    """Validates EventCreate constraints."""

    def test_valid_event(self):
        e = EventCreate(
            event_type="user.signup",
            payload={"foo": "bar"},
            recipients=[RecipientCreate(channels=["email"], email="a@b.com")],
        )
        assert e.event_type == "user.signup"

    def test_empty_event_type_rejected(self):
        with pytest.raises(ValidationError, match="at least 1 character"):
            EventCreate(
                event_type="",
                payload={},
                recipients=[RecipientCreate(channels=["email"], email="a@b.com")],
            )

    def test_long_event_type_rejected(self):
        with pytest.raises(ValidationError, match="at most 255"):
            EventCreate(
                event_type="x" * 256,
                payload={},
                recipients=[RecipientCreate(channels=["email"], email="a@b.com")],
            )
