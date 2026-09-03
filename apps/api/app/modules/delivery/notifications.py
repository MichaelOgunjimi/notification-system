"""Best-effort dispatch for lifecycle notification emails.

Unlike the sign-in, verification, and invitation sends — where the email *is*
the action and a failure must surface as a 502 — the messages routed through
here are after-the-fact notifications. The triggering action (signup, primary
email change, member removal, role change, invitation acceptance) has already
committed. A slow or unavailable email provider must never roll it back, so
:func:`send_notification_email` swallows every failure and only reports it
through the return value and the log.
"""

import asyncio
import logging

from app.modules.delivery.adapters.email import EmailAdapter
from app.modules.delivery.templates.transactional import TransactionalEmail

logger = logging.getLogger(__name__)


async def send_notification_email(recipient: str, message: TransactionalEmail) -> bool:
    """Send one lifecycle notification without ever raising.

    :param recipient: Destination email address.
    :param message: Rendered subject/html/text.
    :returns: ``True`` when the provider accepted the message, ``False`` otherwise.
    """
    try:
        result = await asyncio.to_thread(
            EmailAdapter().send,
            recipient,
            message.subject,
            message.html,
            plain_text=message.text,
        )
    except Exception:  # noqa: BLE001 - best effort; a notification must not break its trigger
        logger.exception("Notification email to %s failed to dispatch", recipient)
        return False
    if not result.success:
        logger.warning(
            "Notification email to %s was not accepted: %s",
            recipient,
            result.error_message,
        )
        return False
    return True
