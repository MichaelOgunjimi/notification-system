"""Download caller-supplied attachment URLs for providers that cannot fetch them (SMTP).

Resend downloads attachment URLs on its own servers; with SMTP the worker has to do it, which
means requesting URLs chosen by API callers. Every request therefore goes only to a public IP
address that was resolved and validated first, and the connection is pinned to that address so a
second DNS lookup cannot swap in an internal one. Redirects are never followed. Nothing is
written to disk; the bytes live in memory until the email is sent.
"""

import ipaddress
import mimetypes
import socket
import time
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

import httpx

_TIMEOUT = httpx.Timeout(10.0)
_MAX_SECONDS = 30.0


class AttachmentError(Exception):
    """Attachment could not be fetched; ``error_type`` is a DeliveryResult error type."""

    def __init__(self, message: str, error_type: str = "permanent_failure") -> None:
        super().__init__(message)
        self.error_type = error_type


@dataclass(frozen=True, slots=True)
class FetchedAttachment:
    """A downloaded attachment ready to be added to a MIME message."""

    filename: str
    content: bytes
    content_type: str


def _public_ip(host: str, port: int, filename: str) -> str:
    """Resolve ``host`` and return one address, refusing anything not publicly routable."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise AttachmentError(
            f"Attachment '{filename}': host not found", "connection_error"
        ) from exc
    addresses = sorted({str(info[4][0]) for info in infos})
    if not addresses:
        raise AttachmentError(f"Attachment '{filename}': host not found", "connection_error")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        if not ip.is_global:
            raise AttachmentError(f"Attachment '{filename}': address is not publicly reachable")
    return addresses[0]


def fetch_attachment(
    url: str,
    filename: str,
    max_bytes: int,
    *,
    transport: httpx.BaseTransport | None = None,
) -> FetchedAttachment:
    """Download one attachment of at most ``max_bytes`` bytes.

    Args:
        url: ``http(s)`` URL supplied by the API caller.
        filename: Name for the attachment; also used to guess the content type.
        max_bytes: Hard limit on the downloaded size.
        transport: Test hook replacing the network transport.

    Raises:
        AttachmentError: With ``error_type`` ``permanent_failure`` for bad or blocked URLs,
            4xx responses, redirects and oversized files; ``server_error``, ``timeout`` or
            ``connection_error`` for transient problems that are worth retrying.
    """
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname or parts.username:
        raise AttachmentError(f"Attachment '{filename}': URL must be http(s) without credentials")
    https = parts.scheme == "https"
    port = parts.port or (443 if https else 80)
    ip = _public_ip(parts.hostname, port, filename)

    pinned = urlunsplit(
        (
            parts.scheme,
            f"[{ip}]:{port}" if ":" in ip else f"{ip}:{port}",
            parts.path or "/",
            parts.query,
            "",
        )
    )
    headers = {"Host": parts.hostname + (f":{parts.port}" if parts.port else "")}
    extensions = {"sni_hostname": parts.hostname} if https else {}

    chunks: list[bytes] = []
    total = 0
    deadline = time.monotonic() + _MAX_SECONDS
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=False, transport=transport) as client:
            with client.stream("GET", pinned, headers=headers, extensions=extensions) as response:
                if 300 <= response.status_code < 400:
                    raise AttachmentError(f"Attachment '{filename}': redirects are not followed")
                if response.status_code >= 500:
                    raise AttachmentError(
                        f"Attachment '{filename}': host returned {response.status_code}",
                        "server_error",
                    )
                if response.status_code >= 400:
                    raise AttachmentError(
                        f"Attachment '{filename}': host returned {response.status_code}"
                    )
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > max_bytes:
                        raise AttachmentError(f"Attachment '{filename}': file is too large")
                    if time.monotonic() > deadline:
                        raise AttachmentError(
                            f"Attachment '{filename}': download too slow", "timeout"
                        )
                    chunks.append(chunk)
    except httpx.TimeoutException as exc:
        raise AttachmentError(f"Attachment '{filename}': download timed out", "timeout") from exc
    except httpx.HTTPError as exc:
        raise AttachmentError(
            f"Attachment '{filename}': connection failed", "connection_error"
        ) from exc

    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return FetchedAttachment(filename, b"".join(chunks), content_type)


def fetch_attachments(
    attachments: list[dict[str, str | int]], max_total_bytes: int
) -> list[FetchedAttachment]:
    """Download every attachment, keeping the combined size within ``max_total_bytes``."""
    fetched: list[FetchedAttachment] = []
    remaining = max_total_bytes
    for item in attachments:
        file = fetch_attachment(str(item["url"]), str(item["filename"]), remaining)
        remaining -= len(file.content)
        fetched.append(file)
    return fetched
