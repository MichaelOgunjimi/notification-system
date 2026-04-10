"""Tests for webhook delivery adapter — HMAC, SSRF, JSON parsing."""

import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services.integrations.webhook import WebhookAdapter

# ---------------------------------------------------------------------------
# HMAC signature tests
# ---------------------------------------------------------------------------


def _mock_http_client(status_code: int = 200, text: str = "OK", side_effect=None) -> MagicMock:
    """Return a mock httpx.Client that fakes a response from a remote server."""
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.text = text

    mock_client = MagicMock()
    if side_effect:
        mock_client.post.side_effect = side_effect
    else:
        mock_client.post.return_value = mock_response
    return mock_client


class TestHmacSignature:
    """Verify the HMAC signature matches the exact bytes sent over the wire."""

    def test_hmac_signature_matches_sent_body(self):
        """The signature in the header must verify against the body bytes sent."""
        secret = "my-webhook-secret"
        adapter = WebhookAdapter()
        mock_client = _mock_http_client(200, "OK")

        with patch.object(adapter, "_validate_url", return_value=(True, None)):
            with patch("app.services.integrations.webhook._http_client", mock_client):
                adapter.send(
                    recipient="https://example.com/hook",
                    subject="Test",
                    body='{"key": "value"}',
                    webhook_secret=secret,
                )

                kw = mock_client.post.call_args.kwargs
                sent_bytes = kw["content"]
                sig_header = kw["headers"]["X-Webhook-Signature"]

                assert sig_header.startswith("sha256=")
                received_sig = sig_header.removeprefix("sha256=")
                expected_sig = hmac.new(secret.encode(), sent_bytes, hashlib.sha256).hexdigest()
                assert received_sig == expected_sig

    def test_no_signature_without_secret(self):
        adapter = WebhookAdapter()
        mock_client = _mock_http_client(200, "OK")

        with patch.object(adapter, "_validate_url", return_value=(True, None)):
            with patch("app.services.integrations.webhook._http_client", mock_client):
                adapter.send(
                    recipient="https://example.com/hook",
                    subject="Test",
                    body="hello",
                )

                headers = mock_client.post.call_args.kwargs["headers"]
                assert "X-Webhook-Signature" not in headers

    def test_content_bytes_used_not_json_kwarg(self):
        """Adapter must use content= (raw bytes) not json= (re-serialized)."""
        adapter = WebhookAdapter()
        mock_client = _mock_http_client(200, "OK")

        with patch.object(adapter, "_validate_url", return_value=(True, None)):
            with patch("app.services.integrations.webhook._http_client", mock_client):
                adapter.send(
                    recipient="https://example.com/hook",
                    subject=None,
                    body="test body",
                    webhook_secret="secret",
                )

                kw = mock_client.post.call_args.kwargs
                assert "content" in kw
                assert "json" not in kw


# ---------------------------------------------------------------------------
# SSRF protection tests
# ---------------------------------------------------------------------------


class TestSsrfProtection:
    """Verify webhook URLs targeting internal networks are blocked."""

    @pytest.mark.parametrize(
        "ip,label",
        [
            ("127.0.0.1", "loopback"),
            ("10.0.0.1", "private-10"),
            ("192.168.1.1", "private-192"),
            ("169.254.169.254", "link-local-metadata"),
            ("172.16.0.1", "private-172"),
        ],
    )
    def test_rejects_internal_ip(self, ip: str, label: str):
        adapter = WebhookAdapter()
        with patch(
            "app.services.integrations.webhook.socket.getaddrinfo",
            return_value=[(2, 1, 0, "", (ip, 80))],
        ):
            ok, err = adapter._validate_url(f"http://evil-{label}.com/hook")
            assert not ok
            assert "internal/private" in (err or "").lower()

    def test_rejects_non_http_scheme(self):
        adapter = WebhookAdapter()
        ok, err = adapter._validate_url("ftp://example.com/file")
        assert not ok
        assert "http" in (err or "").lower()

    def test_rejects_no_hostname(self):
        adapter = WebhookAdapter()
        ok, err = adapter._validate_url("http:///path")
        assert not ok
        assert "hostname" in (err or "").lower()

    def test_allows_public_ip(self):
        adapter = WebhookAdapter()
        with patch(
            "app.services.integrations.webhook.socket.getaddrinfo",
            return_value=[(2, 1, 0, "", ("93.184.216.34", 443))],
        ):
            ok, err = adapter._validate_url("https://example.com/hook")
            assert ok
            assert err is None

    def test_adapter_returns_failure_on_ssrf(self):
        """The adapter returns a failed DeliveryResult, not an exception."""
        adapter = WebhookAdapter()
        with patch(
            "app.services.integrations.webhook.socket.getaddrinfo",
            return_value=[(2, 1, 0, "", ("127.0.0.1", 80))],
        ):
            result = adapter.send(
                recipient="http://localhost/internal",
                subject=None,
                body="test",
            )
        assert not result.success
        assert "internal/private" in (result.error_message or "").lower()


# ---------------------------------------------------------------------------
# JSON body parsing tests
# ---------------------------------------------------------------------------


class TestJsonParsing:
    """Verify robust JSON parsing of the body field."""

    def _get_sent_payload(self, body: str) -> dict:
        adapter = WebhookAdapter()
        mock_client = _mock_http_client(200, "OK")

        with patch.object(adapter, "_validate_url", return_value=(True, None)):
            with patch("app.services.integrations.webhook._http_client", mock_client):
                adapter.send(
                    recipient="https://example.com/hook",
                    subject=None,
                    body=body,
                )

                call_kwargs = mock_client.post.call_args.kwargs
                if "content" in call_kwargs:
                    return json.loads(call_kwargs["content"])
                return call_kwargs["json"]

    def test_json_object_parsed(self):
        payload = self._get_sent_payload('{"key": "value"}')
        assert payload["data"] == {"key": "value"}

    def test_json_array_parsed(self):
        """Arrays should be parsed — was broken with startswith('{')."""
        payload = self._get_sent_payload('[{"a": 1}, {"b": 2}]')
        assert payload["data"] == [{"a": 1}, {"b": 2}]

    def test_json_with_leading_whitespace(self):
        payload = self._get_sent_payload('  {"key": "value"}')
        assert payload["data"] == {"key": "value"}

    def test_plain_text_wrapped(self):
        payload = self._get_sent_payload("Hello, plain text message")
        assert payload["data"] == {"message": "Hello, plain text message"}

    def test_invalid_json_wrapped(self):
        payload = self._get_sent_payload("{broken json")
        assert payload["data"] == {"message": "{broken json"}


# ---------------------------------------------------------------------------
# Delivery result tests
# ---------------------------------------------------------------------------


class TestWebhookDelivery:
    def test_successful_delivery(self):
        adapter = WebhookAdapter()
        mock_client = _mock_http_client(200, "OK")

        with patch.object(adapter, "_validate_url", return_value=(True, None)):
            with patch("app.services.integrations.webhook._http_client", mock_client):
                result = adapter.send(
                    recipient="https://example.com/hook",
                    subject="Test",
                    body="hello",
                )
        assert result.success
        assert result.provider_response["status_code"] == 200

    def test_failed_delivery_500(self):
        adapter = WebhookAdapter()
        mock_client = _mock_http_client(500, "Internal Server Error")

        with patch.object(adapter, "_validate_url", return_value=(True, None)):
            with patch("app.services.integrations.webhook._http_client", mock_client):
                result = adapter.send(
                    recipient="https://example.com/hook",
                    subject="Test",
                    body="hello",
                )
        assert not result.success
        assert "500" in (result.error_message or "")

    def test_timeout_delivery(self):
        adapter = WebhookAdapter()
        mock_client = _mock_http_client(side_effect=httpx.TimeoutException("timed out"))

        with patch.object(adapter, "_validate_url", return_value=(True, None)):
            with patch("app.services.integrations.webhook._http_client", mock_client):
                result = adapter.send(
                    recipient="https://example.com/hook",
                    subject="Test",
                    body="hello",
                )
        assert not result.success
        assert "timeout" in (result.error_message or "").lower()
