"""Email delivery through Resend, SMTP, or an explicit mock provider."""

import logging
import smtplib
from email.message import EmailMessage

import httpx
import resend
from resend.exceptions import (
    ApplicationError,
    InvalidApiKeyError,
    MissingApiKeyError,
    MissingRequiredFieldsError,
    RateLimitError,
    ValidationError,
)

from app.core.config import settings
from app.modules.delivery.adapters.base import BaseAdapter, DeliveryResult
from app.modules.delivery.sender import compose_from

logger = logging.getLogger(__name__)

# Set the Resend API key once at module load — setting it per-call is
# thread-unsafe and causes unpredictable behaviour in tests.
if settings.RESEND_API_KEY:
    resend.api_key = settings.RESEND_API_KEY


def _str_kwarg(kwargs: dict[str, object], key: str) -> str | None:
    value = kwargs.get(key)
    return value if isinstance(value, str) and value else None


class EmailAdapter(BaseAdapter):
    def __init__(self) -> None:
        self.provider = settings.EMAIL_PROVIDER.lower()
        self.api_key = settings.RESEND_API_KEY
        self.from_address = settings.EMAIL_FROM_ADDRESS

    def _resolved_provider(self) -> str:
        if self.provider == "auto":
            return "resend" if self.api_key else "mock"
        return self.provider

    def _send_smtp(
        self,
        recipient: str,
        subject: str | None,
        body: str,
        plain_text: str | None = None,
        from_address: str | None = None,
        reply_to: str | None = None,
    ) -> DeliveryResult:
        message = EmailMessage()
        message["From"] = from_address or self.from_address
        if reply_to:
            message["Reply-To"] = reply_to
        message["To"] = recipient
        message["Subject"] = subject or "(no subject)"
        message.set_content(
            plain_text or "This message contains HTML. View it in an HTML-capable client."
        )
        message.add_alternative(body, subtype="html")

        try:
            with smtplib.SMTP(
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                timeout=settings.SMTP_TIMEOUT_SECONDS,
            ) as smtp:
                if settings.SMTP_STARTTLS:
                    smtp.starttls()
                if settings.SMTP_USERNAME:
                    smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                smtp.send_message(message)
            return DeliveryResult(
                success=True,
                provider_response={"provider": "smtp", "to": recipient},
            )
        except (OSError, smtplib.SMTPException) as exc:
            logger.error("SMTP delivery failed for %s: %s", recipient, exc)
            return DeliveryResult(
                success=False,
                error_message=str(exc),
                error_type="connection_error",
            )

    def send(
        self,
        recipient: str,
        subject: str | None,
        body: str,
        **kwargs: object,
    ) -> DeliveryResult:
        provider = self._resolved_provider()
        plain_text = _str_kwarg(kwargs, "plain_text")
        reply_to = _str_kwarg(kwargs, "reply_to")
        raw_attachments = kwargs.get("attachments")
        attachments = raw_attachments if isinstance(raw_attachments, list) else None
        from_address = compose_from(
            _str_kwarg(kwargs, "from_local"),
            _str_kwarg(kwargs, "from_name"),
            default=self.from_address,
        )
        if provider == "mock":
            logger.warning("Using mock email delivery")
            return DeliveryResult(
                success=True,
                provider_response={"mock": True, "to": recipient},
            )
        if attachments and provider == "smtp":
            # Attachments are URLs that only Resend fetches; fetching them here would
            # mean the worker requesting tenant-supplied URLs (SSRF).
            return DeliveryResult(
                success=False,
                error_message="Attachments require the Resend email provider",
                error_type="permanent_failure",
            )
        if provider == "smtp":
            return self._send_smtp(recipient, subject, body, plain_text, from_address, reply_to)
        if provider != "resend":
            return DeliveryResult(
                success=False,
                error_message=f"Unsupported email provider: {provider}",
                error_type="provider_not_configured",
            )
        if not self.api_key:
            return DeliveryResult(
                success=False,
                error_message="RESEND_API_KEY is required for the Resend provider",
                error_type="provider_not_configured",
            )

        try:
            payload: resend.Emails.SendParams = {
                "from": from_address,
                "to": [recipient],
                "subject": subject or "(no subject)",
                "html": body,
            }
            if plain_text:
                payload["text"] = plain_text
            if reply_to:
                payload["reply_to"] = reply_to
            if attachments:
                payload["attachments"] = [
                    {"filename": a["filename"], "path": a["url"]} for a in attachments
                ]
            response = resend.Emails.send(payload)
            return DeliveryResult(
                success=True,
                provider_response={"id": response["id"]},
            )
        except (ValidationError, MissingRequiredFieldsError) as e:
            logger.error("Resend validation error for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=str(e),
                error_type="permanent_failure",
            )
        except (MissingApiKeyError, InvalidApiKeyError) as e:
            logger.error("Resend auth error for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=str(e),
                error_type="provider_not_configured",
            )
        except RateLimitError as e:
            logger.warning("Resend rate limit for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=str(e),
                error_type="server_error",
            )
        except ApplicationError as e:
            logger.error("Resend server error for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=str(e),
                error_type="server_error",
            )
        except httpx.TimeoutException as e:
            logger.error("Resend timeout for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=f"Email delivery timeout: {e}",
                error_type="timeout",
            )
        except httpx.ConnectError as e:
            logger.error("Resend connection error for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=f"Connection error: {e}",
                error_type="connection_error",
            )
        except Exception as e:
            logger.error("Unexpected Resend error for %s: %s", recipient, e)
            return DeliveryResult(
                success=False,
                error_message=str(e),
                error_type="server_error",
            )
