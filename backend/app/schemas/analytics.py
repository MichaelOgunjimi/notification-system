"""Analytics schemas — delivery metrics and channel statistics."""

from pydantic import BaseModel

from app.models.enums import NotificationChannel


class ChannelStat(BaseModel):
    channel: NotificationChannel
    delivered: int
    failed: int
    pending: int
    dead_letter: int


class AnalyticsResponse(BaseModel):
    # Event counts (today)
    events_today: int
    events_completed: int
    events_failed: int
    events_processing: int

    # Notification counts (today)
    notifications_delivered: int
    notifications_failed: int
    notifications_processing: int
    notifications_queued: int

    # DLQ
    dlq_active: int

    # Derived
    success_rate: float  # delivered / (delivered + failed) * 100, or 100.0 if none
    avg_delivery_latency_ms: float | None  # average latency for today's deliveries

    # Per-channel breakdown
    channel_stats: list[ChannelStat]
