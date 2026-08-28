"""Admin endpoint response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel


class AdminKeyStats(BaseModel):
    id: uuid.UUID
    name: str
    key_prefix: str
    is_active: bool
    event_count: int
    last_used_at: datetime | None = None


class AdminQueueStat(BaseModel):
    queue: str
    length: int


class AdminHealthResponse(BaseModel):
    database: bool
    redis: bool
    queue_lengths: list[AdminQueueStat]
    recent_error_rate: float


class ChannelBreakdown(BaseModel):
    channel: str
    total: int


class TopKeyVolume(BaseModel):
    api_key_id: uuid.UUID
    key_name: str
    total_notifications: int


class AdminAnalyticsResponse(BaseModel):
    total_events: int
    total_notifications: int
    per_channel: list[ChannelBreakdown]
    top_keys: list[TopKeyVolume]
