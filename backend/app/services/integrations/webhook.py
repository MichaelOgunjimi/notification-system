"""Webhook delivery adapter — HTTP POST to registered URLs."""

import hashlib
import hmac
import json
import logging

import httpx

from app.core.config import settings
from app.services.integrations.base import BaseAdapter, DeliveryResult

logger = logging.getLogger(__name__)


class WebhookAdapter(BaseAdapter):
    def __init__(self) -> None:
        self.timeout = settings.WEBHOOK_DEFAULT_TIMEOUT_SECONDS

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

        # Parse body as JSON if possible, otherwise wrap as message
        try:
            data = json.loads(body) if body.startswith("{") else {"message": body}
        except (json.JSONDecodeError, ValueError):
            data = {"message": body}

        payload = {
            "event_type": event_type,
            "notification_id": str(notification_id),
            "data": data,
        }

        headers: dict[str, str] = {"Content-Type": "application/json"}

        if webhook_secret and isinstance(webhook_secret, str):
            payload_bytes = json.dumps(payload, sort_keys=True).encode()
            signature = hmac.new(
                webhook_secret.encode(),
                payload_bytes,
                hashlib.sha256,
            ).hexdigest()
            headers["X-Webhook-Signature"] = f"sha256={signature}"

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    recipient,
                    json=payload,
                    headers=headers,
                )

            if response.status_code < 400:
                return DeliveryResult(
                    success=True,
                    provider_response={
                        "status_code": response.status_code,
                        "body": response.text[:500],
                    },
                )
            return DeliveryResult(
                success=False,
                provider_response={
                    "status_code": response.status_code,
                    "body": response.text[:500],
                },
                error_message=f"Webhook returned {response.status_code}",
            )

        except httpx.TimeoutException:
            return DeliveryResult(
                success=False,
                error_message=f"Webhook timeout after {self.timeout}s",
            )
        except Exception as e:
            logger.error("Webhook error for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=str(e),
            )
