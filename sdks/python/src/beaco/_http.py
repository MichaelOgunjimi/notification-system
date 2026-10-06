"""Shared authenticated HTTP transport."""

import json
import socket
from importlib.metadata import PackageNotFoundError, version
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = "https://beaco.michaelogunjimi.com/api/v1"
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _user_agent() -> str:
    """Identify the SDK; Cloudflare in front of the API blocks urllib's default agent."""
    try:
        return f"beaco-python/{version('beaco')}"
    except PackageNotFoundError:
        return "beaco-python/dev"


USER_AGENT = _user_agent()


class BeacoError(Exception):
    """A structured Beaco API or network error.

    Attributes:
        code: Stable machine-readable error code. Network failures use
            ``NETWORK_ERROR``.
        status: HTTP response status, or ``0`` when no response was received.
        details: Field-level validation failures returned by the API.
        retryable: Whether retrying later may succeed. Network failures, rate limits,
            and server errors are considered retryable.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str,
        status: int,
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        """Initialize an error from normalized API response details.

        Args:
            message: Human-readable failure description.
            code: Stable machine-readable error code.
            status: HTTP response status, or ``0`` for a transport failure.
            details: Optional field-level validation failures.
        """
        super().__init__(message)
        self.code, self.status, self.details = code, status, details or []
        self.retryable = status == 0 or status == 429 or status >= 500


class Transport:
    """Internal JSON-over-HTTP transport."""

    def __init__(
        self, api_key: str, base_url: str, timeout: float, allow_insecure_http: bool
    ) -> None:
        """Configure the shared authenticated JSON transport.

        Args:
            api_key: Secret project key attached to each request.
            base_url: Absolute Beaco API root URL.
            timeout: Per-request timeout in seconds.
            allow_insecure_http: Permit cleartext HTTP for a non-loopback endpoint.

        Raises:
            ValueError: If authentication or endpoint configuration is invalid.
        """
        if not api_key.strip():
            raise ValueError("Beaco api_key is required.")
        if timeout <= 0:
            raise ValueError("Beaco timeout must be greater than zero.")
        parsed = urlparse(base_url)
        if parsed.hostname is None:
            raise ValueError("Beaco base_url must be an absolute URL.")
        if parsed.scheme != "https" and not (
            parsed.scheme == "http"
            and (parsed.hostname in LOOPBACK_HOSTS or allow_insecure_http)
        ):
            raise ValueError(
                "Beaco base_url must use HTTPS unless it is a loopback URL."
            )
        self.api_key, self.base_url, self.timeout = (
            api_key.strip(),
            base_url.rstrip("/"),
            timeout,
        )

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        body: Any = None,
        query: Optional[dict[str, Any]] = None,
    ) -> Any:
        """Send one authenticated JSON request and decode its response.

        Args:
            path: API path beginning with ``/``.
            method: HTTP method. Defaults to ``GET``.
            body: Optional JSON-serializable request body.
            query: Optional query parameters. Values set to ``None`` are omitted.

        Returns:
            The decoded JSON response, or ``None`` for a 204 response.

        Raises:
            BeacoError: If the API returns a non-success status or the request fails
                before a response is received.

        Note:
            The secret API key is sent in the ``X-API-Key`` header. Do not configure a
            remote cleartext HTTP endpoint outside controlled development environments.
        """
        encoded_query = urlencode(
            {k: v for k, v in (query or {}).items() if v is not None}
        )
        data = json.dumps(body).encode() if body is not None else None
        request = Request(
            f"{self.base_url}{path}{f'?{encoded_query}' if encoded_query else ''}",
            data=data,
            method=method,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
                "X-API-Key": self.api_key,
            },
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return None if response.status == 204 else json.loads(response.read())
        except HTTPError as error:
            try:
                payload = json.loads(error.read())
            except (json.JSONDecodeError, UnicodeDecodeError):
                payload = {}
            api_error = payload.get("error", {})
            raise BeacoError(
                api_error.get("message")
                or payload.get("detail")
                or f"Beaco API request failed ({error.code}).",
                code=api_error.get("code", "API_ERROR"),
                status=error.code,
                details=api_error.get("details"),
            ) from error
        except (URLError, TimeoutError, socket.timeout, OSError) as error:
            raise BeacoError(
                "Unable to reach the Beaco API.", code="NETWORK_ERROR", status=0
            ) from error


def required(value: str, name: str) -> str:
    """Validate a required string value.

    Args:
        value: Candidate value.
        name: Field name included in the validation message.

    Returns:
        The unchanged non-empty value.

    Raises:
        ValueError: If ``value`` is empty.
    """
    if not value:
        raise ValueError(f"{name} is required.")
    return value
