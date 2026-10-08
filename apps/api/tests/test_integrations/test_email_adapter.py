"""Tests for email adapter error classification."""

from unittest.mock import patch

import httpx
import pytest
import requests
from resend.exceptions import (
    ApplicationError,
    InvalidApiKeyError,
    MissingApiKeyError,
    MissingRequiredFieldsError,
    RateLimitError,
    ValidationError,
)

from app.modules.delivery.adapters.attachments import AttachmentError, FetchedAttachment
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
        assert "something unexpected" not in result.error_message

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_sdk_wrapped_dns_failure_is_connection_error(self, mock_send, adapter):
        """The Resend SDK wraps requests errors in RuntimeError; DNS failures must say so."""
        cause = requests.ConnectionError("Failed to resolve 'api.resend.com'")
        error = RuntimeError("Request failed: HTTPSConnectionPool(host='api.resend.com')")
        error.__cause__ = cause
        mock_send.side_effect = error
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.success is False
        assert result.error_type == "connection_error"
        assert "Could not reach the email provider" in result.error_message
        assert "HTTPSConnectionPool" not in result.error_message
        assert "The message was not sent." in result.error_message
        assert "retried" not in result.error_message

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_sdk_wrapped_timeout_is_timeout(self, mock_send, adapter):
        error = RuntimeError("Request failed: read timed out")
        error.__cause__ = requests.ReadTimeout("read timed out")
        mock_send.side_effect = error
        result = adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        assert result.error_type == "timeout"

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

        result = adapter.send(
            "user@test.com",
            "Magic link",
            "<p>Sign in</p>",
            plain_text="Sign in with this private link.",
        )

        assert result.success is True
        smtp.send_message.assert_called_once()
        message = smtp.send_message.call_args.args[0]
        assert message["To"] == "user@test.com"
        assert message["Subject"] == "Magic link"
        assert (
            "Sign in with this private link."
            in message.get_body(preferencelist=("plain",)).get_content()
        )


class TestSenderFields:
    """from_local / from_name / reply_to reach the provider; the domain never changes."""

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_resend_payload_carries_sender_and_reply_to(self, mock_send, adapter):
        mock_send.return_value = {"id": "email_1"}
        adapter.from_address = "no-reply@verified.example"
        adapter.send(
            "user@test.com",
            "Hello",
            "<p>Hi</p>",
            from_local="orders",
            from_name="Winwell Orders",
            reply_to="support@winwell.example",
        )
        payload = mock_send.call_args.args[0]
        assert payload["from"] == "Winwell Orders <orders@verified.example>"
        assert payload["reply_to"] == "support@winwell.example"

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_resend_falls_back_to_global_default(self, mock_send, adapter):
        mock_send.return_value = {"id": "email_1"}
        adapter.from_address = "no-reply@verified.example"
        adapter.send("user@test.com", "Hello", "<p>Hi</p>")
        payload = mock_send.call_args.args[0]
        assert payload["from"] == "no-reply@verified.example"
        assert "reply_to" not in payload

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_resend_ignores_empty_sender_fields(self, mock_send, adapter):
        mock_send.return_value = {"id": "email_1"}
        adapter.from_address = "no-reply@verified.example"
        adapter.send(
            "user@test.com", "Hello", "<p>Hi</p>", from_local=None, from_name=None, reply_to=None
        )
        payload = mock_send.call_args.args[0]
        assert payload["from"] == "no-reply@verified.example"
        assert "reply_to" not in payload

    @patch("app.modules.delivery.adapters.email.smtplib.SMTP")
    def test_smtp_headers_carry_sender_and_reply_to(self, smtp_class):
        smtp = smtp_class.return_value.__enter__.return_value
        with patch.object(EmailAdapter, "__init__", lambda self: None):
            smtp_adapter = EmailAdapter()
            smtp_adapter.provider = "smtp"
            smtp_adapter.api_key = ""
            smtp_adapter.from_address = "no-reply@verified.example"

        result = smtp_adapter.send(
            "user@test.com",
            "Hello",
            "<p>Hi</p>",
            from_local="support",
            from_name="Winwell Support",
            reply_to="help@winwell.example",
        )

        assert result.success is True
        message = smtp.send_message.call_args.args[0]
        assert message["From"] == "Winwell Support <support@verified.example>"
        assert message["Reply-To"] == "help@winwell.example"

    @patch("app.modules.delivery.adapters.email.smtplib.SMTP")
    def test_smtp_falls_back_to_global_default(self, smtp_class):
        smtp = smtp_class.return_value.__enter__.return_value
        with patch.object(EmailAdapter, "__init__", lambda self: None):
            smtp_adapter = EmailAdapter()
            smtp_adapter.provider = "smtp"
            smtp_adapter.api_key = ""
            smtp_adapter.from_address = "no-reply@verified.example"

        smtp_adapter.send("user@test.com", "Hello", "<p>Hi</p>")

        message = smtp.send_message.call_args.args[0]
        assert message["From"] == "no-reply@verified.example"
        assert message["Reply-To"] is None


class TestAttachments:
    ATTACHMENTS = [
        {
            "filename": "invoice.pdf",
            "url": "https://files.example.com/invoice.pdf",
            "size_bytes": 1000,
        }
    ]

    @patch("app.modules.delivery.adapters.email.resend.Emails.send")
    def test_resend_receives_remote_attachments(self, mock_send, adapter):
        mock_send.return_value = {"id": "email_123"}
        result = adapter.send("user@test.com", "Hi", "<p>Hi</p>", attachments=self.ATTACHMENTS)
        assert result.success is True
        assert mock_send.call_args.args[0]["attachments"] == [
            {"filename": "invoice.pdf", "path": "https://files.example.com/invoice.pdf"}
        ]

    @patch("app.modules.delivery.adapters.email.smtplib.SMTP")
    @patch("app.modules.delivery.adapters.email.fetch_attachments")
    def test_smtp_sends_downloaded_attachments(self, mock_fetch, mock_smtp, adapter):
        adapter.provider = "smtp"
        mock_fetch.return_value = [FetchedAttachment("invoice.pdf", b"%PDF-1.4", "application/pdf")]
        result = adapter.send("user@test.com", "Hi", "<p>Hi</p>", attachments=self.ATTACHMENTS)
        assert result.success is True
        message = mock_smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
        assert message.get_content_type() == "multipart/mixed"
        attachment = next(message.iter_attachments())
        assert attachment.get_filename() == "invoice.pdf"
        assert attachment.get_content_type() == "application/pdf"
        assert attachment.get_payload(decode=True) == b"%PDF-1.4"

    @patch("app.modules.delivery.adapters.email.smtplib.SMTP")
    @patch("app.modules.delivery.adapters.email.fetch_attachments")
    def test_smtp_fails_without_sending_when_download_fails(self, mock_fetch, mock_smtp, adapter):
        adapter.provider = "smtp"
        mock_fetch.side_effect = AttachmentError("blocked", "permanent_failure")
        result = adapter.send("user@test.com", "Hi", "<p>Hi</p>", attachments=self.ATTACHMENTS)
        assert result.success is False
        assert result.error_type == "permanent_failure"
        mock_smtp.assert_not_called()
