"""Webhook delivery adapter — HTTP POST to registered URLs."""

import hashlib
import hmac
import ipaddress
import json
import logging
import socket
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.services.integrations.base import BaseAdapter, DeliveryResult

logger = logging.getLogger(__name__)

# Module-level client reused across all webhook deliveries in this worker
# process. Celery's prefork model gives each worker process its own instance,
# so there is no cross-process sharing. Eager init is intentional — it removes
# the check-then-assign race that would occur under thread/gevent pools.
_http_client = httpx.Client(
    timeout=settings.WEBHOOK_DEFAULT_TIMEOUT_SECONDS,
    limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
)


class WebhookAdapter(BaseAdapter):
    def __init__(self) -> None:
        self.timeout = settings.WEBHOOK_DEFAULT_TIMEOUT_SECONDS

    @staticmethod
    def _is_internal_ip(value: str) -> bool:
        try:
            ip = ipaddress.ip_address(value)
        except ValueError:
            return True
        return (
            ip.is_loopback
            or ip.is_private
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_unspecified
        )

    def _validate_url(self, url: str) -> tuple[bool, str | None, list[str]]:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return False, "Webhook URL must use http or https", []
        if not parsed.hostname:
            return False, "Webhook URL must include a hostname", []
        port = parsed.port or (443 if parsed.scheme == "https" else 80)

        try:
            address_info = socket.getaddrinfo(parsed.hostname, port)
        except socket.gaierror:
            return False, "Cannot resolve webhook hostname", []
        except Exception:
            return False, "Webhook URL validation failed", []

        if not address_info:
            return False, "Cannot resolve webhook hostname", []

        resolved_ips: list[str] = []
        for _, _, _, _, sockaddr in address_info:
            ip_str = str(sockaddr[0])
            if self._is_internal_ip(ip_str):
                return False, "Webhook URL resolves to an internal/private address", []
            resolved_ips.append(ip_str)

        return True, None, resolved_ips

    def send(
        self,
        recipient: str,  # webhook URL
        subject: str | None,
        body: str,
        **kwargs: object,
    ) -> DeliveryResult:
        webhook_secret = kwargs.get("webhook_secret")
        event_type = kwargs.get("event_type", "notification")
        notification_id = kwargs.get("notification_id", "")

        is_valid_url, error_message, resolved_ips = self._validate_url(recipient)
        if not is_valid_url:
            return DeliveryResult(
                success=False,
                error_message=error_message,
                error_type="permanent_failure",
            )

        # Parse body as JSON if possible, otherwise wrap as message
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, ValueError):
            data = {"message": body}

        payload = {
            "event_type": event_type,
            "notification_id": str(notification_id),
            "data": data,
        }

        headers: dict[str, str] = {"Content-Type": "application/json"}
        payload_bytes: bytes | None = None

        if webhook_secret and isinstance(webhook_secret, str):
            payload_bytes = json.dumps(payload, sort_keys=True).encode()
            signature = hmac.new(
                webhook_secret.encode(),
                payload_bytes,
                hashlib.sha256,
            ).hexdigest()
            headers["X-Webhook-Signature"] = f"sha256={signature}"

        try:
            if webhook_secret and isinstance(webhook_secret, str):
                response = _http_client.post(
                    recipient,
                    content=payload_bytes or b"",
                    headers=headers,
                )
            else:
                response = _http_client.post(
                    recipient,
                    json=payload,
                    headers=headers,
                )

            _, recheck_error, recheck_ips = self._validate_url(recipient)
            if recheck_error or set(recheck_ips) != set(resolved_ips):
                logger.warning(
                    "DNS rebinding detected for %s: %s (initial_ips=%s, recheck_ips=%s)",
                    recipient,
                    recheck_error or "resolved IP set changed",
                    resolved_ips,
                    recheck_ips,
                )
                return DeliveryResult(
                    success=False,
                    error_message="DNS rebinding detected",
                    error_type="permanent_failure",
                )

            if response.status_code < 400:
                return DeliveryResult(
                    success=True,
                    provider_response={
                        "status_code": response.status_code,
                        "body": response.text[:500],
                    },
                )
            error_type = "server_error" if response.status_code >= 500 else "client_error"
            return DeliveryResult(
                success=False,
                provider_response={
                    "status_code": response.status_code,
                    "body": response.text[:500],
                },
                error_message=f"Webhook returned {response.status_code}",
                error_type=error_type,
            )

        except httpx.TimeoutException:
            return DeliveryResult(
                success=False,
                error_message=f"Webhook timeout after {self.timeout}s",
                error_type="timeout",
            )
        except httpx.ConnectError:
            return DeliveryResult(
                success=False,
                error_message="Connection refused or DNS failure",
                error_type="connection_error",
            )
        except Exception as e:
            logger.error("Webhook error for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=str(e),
                error_type="connection_error",
            )
