"""Custom application exceptions."""

from enum import StrEnum


class ErrorCode(StrEnum):
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    GONE = "GONE"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    BAD_REQUEST = "BAD_REQUEST"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


class NotificationSystemError(Exception):
    """Base exception for the notification system."""


class EventNotFoundError(NotificationSystemError):
    """Raised when an event cannot be found."""


class NotificationNotFoundError(NotificationSystemError):
    """Raised when a notification cannot be found."""


class TemplateNotFoundError(NotificationSystemError):
    """Raised when a template cannot be found."""


class TemplateRenderError(NotificationSystemError):
    """Raised when a template fails to render."""


class DeliveryError(NotificationSystemError):
    """Raised when notification delivery fails."""


class RateLimitExceededError(NotificationSystemError):
    """Raised when rate limit is exceeded."""


class IdempotencyConflictError(NotificationSystemError):
    """Raised when a duplicate idempotency key is detected."""
