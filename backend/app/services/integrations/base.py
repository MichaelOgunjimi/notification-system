"""Base class for all notification delivery adapters."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class DeliveryResult:
    """Standard result from a delivery attempt.

    error_type classifies the failure so retry logic can decide eligibility:
      - "timeout"               — provider didn't respond in time (retryable)
      - "server_error"          — 5xx / provider outage (retryable)
      - "client_error"          — 4xx from provider (usually not retryable)
      - "connection_error"      — DNS / TCP failure (retryable)
      - "provider_not_configured" — missing API key etc. (not retryable)
      - "permanent_failure"     — invalid recipient, SSRF block (never retry)
    """

    success: bool
    provider_response: dict | None = None
    error_message: str | None = None
    error_type: str | None = None


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
