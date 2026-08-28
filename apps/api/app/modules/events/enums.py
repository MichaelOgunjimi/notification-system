"""Event-owned state and priority values."""

import enum


class EventStatus(enum.StrEnum):
    ACCEPTED = "accepted"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIALLY_FAILED = "partially_failed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EventPriority(enum.StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ScheduledEventStatus(enum.StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    DISPATCHED = "dispatched"
    CANCELLED = "cancelled"
    FAILED = "failed"
    EXPIRED = "expired"
