"""SMS delivery adapter — mock implementation for development."""

import logging

from app.core.config import settings
from app.services.integrations.base import BaseAdapter, DeliveryResult

logger = logging.getLogger(__name__)


class SmsAdapter(BaseAdapter):
    def __init__(self) -> None:
        self.provider = settings.SMS_PROVIDER

    def send(
        self,
        recipient: str,
        subject: str | None,
        body: str,
        **kwargs: object,
    ) -> DeliveryResult:
        if self.provider == "mock":
            logger.info("Mock SMS to %s: %s", recipient, body[:100])
            return DeliveryResult(
                success=True,
                provider_response={"mock": True, "to": recipient},
            )

        # Future: Twilio integration
        logger.error("SMS provider '%s' not implemented", self.provider)
        return DeliveryResult(
            success=False,
            error_message=f"SMS provider '{self.provider}' not implemented",
            error_type="provider_not_configured",
        )
