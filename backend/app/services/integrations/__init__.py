"""Notification delivery adapters."""

from app.services.integrations.email import EmailAdapter
from app.services.integrations.sms import SmsAdapter
from app.services.integrations.webhook import WebhookAdapter

_adapters: dict[str, type] = {
    "email": EmailAdapter,
    "sms": SmsAdapter,
    "webhook": WebhookAdapter,
}


def get_adapter(channel: str):  # noqa: ANN201
    """Get the delivery adapter for a channel."""
    adapter_class = _adapters.get(channel)
    if adapter_class is None:
        raise ValueError(f"No adapter for channel: {channel}")
    return adapter_class()
