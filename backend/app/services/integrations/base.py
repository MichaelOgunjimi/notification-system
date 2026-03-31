"""Base class for all notification delivery adapters."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class DeliveryResult:
    """Standard result from a delivery attempt."""

    success: bool
    provider_response: dict | None = None
    error_message: str | None = None


class BaseAdapter(ABC):
    """Abstract base for notification delivery adapters."""

    @abstractmethod
    def send(
        self,
        recipient: str,
        subject: str | None,
        body: str,
        **kwargs: object,
    ) -> DeliveryResult:
        """Send a notification. Returns DeliveryResult."""
        ...
