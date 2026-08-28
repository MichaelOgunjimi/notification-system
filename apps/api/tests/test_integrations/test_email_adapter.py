"""Tests for email adapter error classification."""

from unittest.mock import patch

import httpx
import pytest
from resend.exceptions import (
    ApplicationError,
    InvalidApiKeyError,
    MissingApiKeyError,
    MissingRequiredFieldsError,
    RateLimitError,
    ValidationError,
)

from app.modules.delivery.adapters.email import EmailAdapter


@pytest.fixture()
def adapter():
    """EmailAdapter with a fake API key so it doesn't use mock mode."""
    with patch.object(EmailAdapter, "__init__", lambda self: None):
        a = EmailAdapter()
        a.provider = "resend"
        a.api_key = "re_test_key"
        a.from_address = "test@example.com"
        return a


class TestEmailErrorClassification:
    """Each Resend exception type must map to the correct error_type."""

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_success(self, mock_send, adapter):
        mock_send.return_value = {"id": "email_123"}
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is True
        assert result.provider_response == {"id": "email_123"}
        assert result.error_type is None

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_validation_error_is_permanent(self, mock_send, adapter):
        mock_send.side_effect = ValidationError(
            message="Invalid email", error_type="validation_error", code=400
        )
        result = adapter.send("bad@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "permanent_failure"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_missing_required_fields_is_permanent(self, mock_send, adapter):
        mock_send.side_effect = MissingRequiredFieldsError(
            message="Missing 'to'", error_type="missing_required_fields", code=422
        )
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "permanent_failure"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_missing_api_key_is_provider_not_configured(self, mock_send, adapter):
        mock_send.side_effect = MissingApiKeyError(
            message="Missing API key", error_type="missing_api_key", code=401
        )
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "provider_not_configured"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_invalid_api_key_is_provider_not_configured(self, mock_send, adapter):
        mock_send.side_effect = InvalidApiKeyError(
            message="Invalid API key", error_type="invalid_api_key", code=403
        )
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "provider_not_configured"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_rate_limit_is_server_error(self, mock_send, adapter):
        mock_send.side_effect = RateLimitError(
            message="Rate limit exceeded", error_type="rate_limit_exceeded", code=429
        )
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "server_error"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_application_error_is_server_error(self, mock_send, adapter):
        mock_send.side_effect = ApplicationError(
            message="Internal server error", error_type="application_error", code=500
        )
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "server_error"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_timeout_exception(self, mock_send, adapter):
        mock_send.side_effect = httpx.ReadTimeout("timed out")
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "timeout"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_connect_error(self, mock_send, adapter):
        mock_send.side_effect = httpx.ConnectError("connection refused")
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "connection_error"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_unknown_exception_defaults_to_server_error(self, mock_send, adapter):
        mock_send.side_effect = RuntimeError("something unexpected")
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "server_error"
        assert "something unexpected" in result.error_message

    def test_mock_mode_when_no_api_key(self):
        """When RESEND_API_KEY is unset, adapter uses mock mode."""
        with patch.object(EmailAdapter, "__init__", lambda self: None):
            a = EmailAdapter()
            a.provider = "auto"
            a.api_key = ""
            a.from_address = "test@example.com"
            result = a.send("user@test.com", "Hello", "<p>Hi</p>")
            assert result.success is True
            assert result.provider_response["mock"] is True

    @patch("app.modules.delivery.adapters.email.smtplib.SMTP")
    def test_smtp_provider_sends_html_message(self, smtp_class):
        smtp = smtp_class.return_value.__enter__.return_value
        with patch.object(EmailAdapter, "__init__", lambda self: None):
            adapter = EmailAdapter()
            adapter.provider = "smtp"
            adapter.api_key = ""
            adapter.from_address = "notifications@beaco.local"

        result = adapter.send("user@test.com", "Magic link", "<p>Sign in</p>")

        assert result.success is True
        smtp.send_message.assert_called_once()
        message = smtp.send_message.call_args.args[0]
        assert message["To"] == "user@test.com"
        assert message["Subject"] == "Magic link"
