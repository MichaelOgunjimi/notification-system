"""Custom application exceptions."""


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
