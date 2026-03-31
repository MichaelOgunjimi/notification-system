"""Email delivery adapter using Resend API."""

import logging

import resend

from app.core.config import settings
from app.services.integrations.base import BaseAdapter, DeliveryResult

logger = logging.getLogger(__name__)


class EmailAdapter(BaseAdapter):
    def __init__(self) -> None:
        self.api_key = settings.RESEND_API_KEY
        self.from_address = settings.EMAIL_FROM_ADDRESS
        if self.api_key:
            resend.api_key = self.api_key

    def send(
        self,
        recipient: str,
        subject: str | None,
        body: str,
        **kwargs: object,
    ) -> DeliveryResult:
        if not self.api_key:
            logger.warning("RESEND_API_KEY not set — using mock email delivery")
            return DeliveryResult(
                success=True,
                provider_response={"mock": True, "to": recipient},
            )

        try:
            response = resend.Emails.send(
                {
                    "from": self.from_address,
                    "to": [recipient],
                    "subject": subject or "(no subject)",
                    "html": body,
                }
            )
            return DeliveryResult(
                success=True,
                provider_response={"id": response["id"]},
            )
        except Exception as e:
            logger.error("Resend API error for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=str(e),
            )
