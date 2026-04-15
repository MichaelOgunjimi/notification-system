"""Enum types used across notification system models."""

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


class NotificationStatus(enum.StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    PROCESSING = "processing"
    DELIVERED = "delivered"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"
    CANCELLED = "cancelled"


class NotificationChannel(enum.StrEnum):
    EMAIL = "email"
    SMS = "sms"
    WEBHOOK = "webhook"


class DeadLetterStatus(enum.StrEnum):
    ACTIVE = "active"
    RETRIED = "retried"
    DISCARDED = "discarded"


class ScheduledEventStatus(enum.StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    DISPATCHED = "dispatched"
    CANCELLED = "cancelled"
    FAILED = "failed"
