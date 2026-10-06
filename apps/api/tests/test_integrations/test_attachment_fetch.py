"""Attachment downloads for SMTP: SSRF guard, connection pinning and size limits."""

from unittest.mock import patch

import httpx
import pytest

from app.modules.delivery.adapters.attachments import AttachmentError, fetch_attachment

PUBLIC_IP = "93.184.216.34"
URL = "https://files.example.com/invoices/1042.pdf?sig=abc"


def _resolve(*addresses: str):
    infos = [(0, 0, 0, "", (address, 0)) for address in addresses]
    return patch("app.modules.delivery.adapters.attachments.socket.getaddrinfo", return_value=infos)


def _fetch(handler, url: str = URL, max_bytes: int = 1000):
    return fetch_attachment(url, "invoice.pdf", max_bytes, transport=httpx.MockTransport(handler))


def _ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, content=b"%PDF-1.4")


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.5",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "::1",
        "::ffff:127.0.0.1",
        "fd00::1",
    ],
)
def test_blocks_non_public_addresses(address: str) -> None:
    with _resolve(address), pytest.raises(AttachmentError) as exc:
        _fetch(_ok)
    assert exc.value.error_type == "permanent_failure"


def test_blocks_when_any_resolved_address_is_internal() -> None:
    with _resolve(PUBLIC_IP, "10.0.0.5"), pytest.raises(AttachmentError):
        _fetch(_ok)


@pytest.mark.parametrize(
    "url",
    [
        "ftp://files.example.com/a.pdf",
        "file:///etc/passwd",
        "https://user:pw@files.example.com/a.pdf",
    ],
)
def test_rejects_bad_urls(url: str) -> None:
    with pytest.raises(AttachmentError) as exc:
        _fetch(_ok, url)
    assert exc.value.error_type == "permanent_failure"


def test_downloads_from_the_validated_ip_with_the_original_host() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=b"%PDF-1.4")

    with _resolve(PUBLIC_IP):
        file = _fetch(handler)

    assert file.content == b"%PDF-1.4"
    assert file.content_type == "application/pdf"
    assert seen[0].url.host == PUBLIC_IP
    assert seen[0].url.path == "/invoices/1042.pdf"
    assert seen[0].url.query == b"sig=abc"
    assert seen[0].headers["host"] == "files.example.com"
    assert seen[0].extensions["sni_hostname"] == "files.example.com"


def test_redirects_are_not_followed() -> None:
    with _resolve(PUBLIC_IP), pytest.raises(AttachmentError) as exc:
        _fetch(lambda r: httpx.Response(302, headers={"location": "http://169.254.169.254/"}))
    assert exc.value.error_type == "permanent_failure"


@pytest.mark.parametrize(
    ("status", "error_type"), [(404, "permanent_failure"), (503, "server_error")]
)
def test_http_errors_are_classified(status: int, error_type: str) -> None:
    with _resolve(PUBLIC_IP), pytest.raises(AttachmentError) as exc:
        _fetch(lambda r: httpx.Response(status))
    assert exc.value.error_type == error_type


def test_rejects_files_over_the_limit() -> None:
    with _resolve(PUBLIC_IP), pytest.raises(AttachmentError, match="too large"):
        _fetch(lambda r: httpx.Response(200, content=b"x" * 2000), max_bytes=1000)


def test_connection_errors_are_retryable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    with _resolve(PUBLIC_IP), pytest.raises(AttachmentError) as exc:
        _fetch(handler)
    assert exc.value.error_type == "connection_error"
