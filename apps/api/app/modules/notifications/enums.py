"""Notification-owned channel and lifecycle values."""

import enum


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
