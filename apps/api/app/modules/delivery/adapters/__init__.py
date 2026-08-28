"""Notification delivery adapters."""

from app.modules.delivery.adapters.email import EmailAdapter
from app.modules.delivery.adapters.sms import SmsAdapter
from app.modules.delivery.adapters.webhook import WebhookAdapter

_adapters: dict[str, type] = {
    "email": EmailAdapter,
    "sms": SmsAdapter,
    "webhook": WebhookAdapter,
}

# Cached singletons — one adapter instance per channel per worker process.
# This allows adapters to hold persistent state (connection pools, config).
_adapter_instances: dict[str, object] = {}


def get_adapter(channel: str):  # noqa: ANN201
    """Get the delivery adapter for a channel (singleton per process)."""
    if channel not in _adapter_instances:
        adapter_class = _adapters.get(channel)
        if adapter_class is None:
            raise ValueError(f"No adapter for channel: {channel}")
        _adapter_instances[channel] = adapter_class()
    return _adapter_instances[channel]
