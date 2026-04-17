"""Analytics service — aggregation queries for delivery metrics."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.dead_letter import DeadLetterMessage
from app.models.enums import (
    DeadLetterStatus,
    EventStatus,
    NotificationChannel,
    NotificationStatus,
)
from app.models.event import Event
from app.models.notification import Notification
from app.schemas.analytics import AnalyticsResponse, ChannelStat, TrendPoint, TrendResponse
from app.utils.datetime import to_naive_utc


def _today_start() -> datetime:
    # Return naive UTC midnight — DB columns are TIMESTAMP WITHOUT TIME ZONE
    return datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)


async def get_analytics(
    db: AsyncSession,
    api_key_id: uuid.UUID | None,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> AnalyticsResponse:
    start = to_naive_utc(date_from) if date_from is not None else _today_start()
    end = to_naive_utc(date_to) if date_to is not None else None

    event_status_rows = (
        await db.execute(
            select(col(Event.status), func.count().label("cnt"))
            .where(col(Event.created_at) >= start)
            .where(*([col(Event.created_at) <= end] if end is not None else []))
            .where(*([col(Event.api_key_id) == api_key_id] if api_key_id is not None else []))
            .group_by(col(Event.status))
        )
    ).all()

    events_today = sum(row.cnt for row in event_status_rows)
    events_completed = next(
        (row.cnt for row in event_status_rows if row.status == EventStatus.COMPLETED), 0
    )
    events_failed = next(
        (row.cnt for row in event_status_rows if row.status == EventStatus.FAILED), 0
    )
    events_processing = next(
        (row.cnt for row in event_status_rows if row.status == EventStatus.PROCESSING), 0
    )

    notif_status_rows = (
        await db.execute(
            select(col(Notification.status), func.count().label("cnt"))
            .join(Event, col(Notification.event_id) == col(Event.id))
            .where(*([col(Event.api_key_id) == api_key_id] if api_key_id is not None else []))
            .where(col(Notification.created_at) >= start)
            .where(*([col(Notification.created_at) <= end] if end is not None else []))
            .group_by(col(Notification.status))
        )
    ).all()

    def _ncount(status: NotificationStatus) -> int:
        return next((row.cnt for row in notif_status_rows if row.status == status), 0)

    notifications_delivered = _ncount(NotificationStatus.DELIVERED)
    notifications_failed = _ncount(NotificationStatus.FAILED)
    notifications_processing = _ncount(NotificationStatus.PROCESSING)
    notifications_queued = _ncount(NotificationStatus.QUEUED)

    total_terminal = notifications_delivered + notifications_failed
    success_rate = notifications_delivered / total_terminal * 100 if total_terminal > 0 else 100.0

    latency_expr = extract(  # type: ignore[call-overload]
        "epoch",
        func.age(Notification.delivered_at, Notification.queued_at),
    )
    latency_result = (
        await db.execute(
            select(func.avg(latency_expr * 1000).label("avg_ms"))
            .join(Event, col(Notification.event_id) == col(Event.id))
            .where(*([col(Event.api_key_id) == api_key_id] if api_key_id is not None else []))
            .where(col(Notification.delivered_at).isnot(None))
            .where(col(Notification.queued_at).isnot(None))
            .where(col(Notification.created_at) >= start)
            .where(*([col(Notification.created_at) <= end] if end is not None else []))
            # Exclude outliers — notifications delayed by system downtime / worker issues
            .where(latency_expr < 300)  # cap at 5 minutes
        )
    ).scalar_one_or_none()
    avg_latency = float(latency_result) if latency_result is not None else None

    dlq_active = (
        await db.execute(
            select(func.count())
            .select_from(DeadLetterMessage)
            .join(
                Notification,
                col(DeadLetterMessage.notification_id) == col(Notification.id),
            )
            .join(Event, col(Notification.event_id) == col(Event.id))
            .where(*([col(Event.api_key_id) == api_key_id] if api_key_id is not None else []))
            .where(col(DeadLetterMessage.status) == DeadLetterStatus.ACTIVE)
            .where(col(DeadLetterMessage.failed_at) >= start)
            .where(*([col(DeadLetterMessage.failed_at) <= end] if end is not None else []))
        )
    ).scalar() or 0

    channel_rows = (
        await db.execute(
            select(
                col(Notification.channel),
                col(Notification.status),
                func.count().label("cnt"),
            )
            .join(Event, col(Notification.event_id) == col(Event.id))
            .where(*([col(Event.api_key_id) == api_key_id] if api_key_id is not None else []))
            .where(col(Notification.created_at) >= start)
            .where(*([col(Notification.created_at) <= end] if end is not None else []))
            .group_by(col(Notification.channel), col(Notification.status))
        )
    ).all()

    channel_map: dict[NotificationChannel, dict[str, int]] = {}
    for row in channel_rows:
        channel = row.channel
        if channel not in channel_map:
            channel_map[channel] = {
                "delivered": 0,
                "failed": 0,
                "pending": 0,
                "dead_letter": 0,
            }

        if row.status == NotificationStatus.DELIVERED:
            channel_map[channel]["delivered"] += row.cnt
        elif row.status == NotificationStatus.FAILED:
            channel_map[channel]["failed"] += row.cnt
        elif row.status == NotificationStatus.DEAD_LETTER:
            channel_map[channel]["dead_letter"] += row.cnt
        else:
            channel_map[channel]["pending"] += row.cnt

    channel_stats = [
        ChannelStat(channel=channel, **counts) for channel, counts in channel_map.items()
    ]

    return AnalyticsResponse(
        events_today=events_today,
        events_completed=events_completed,
        events_failed=events_failed,
        events_processing=events_processing,
        notifications_delivered=notifications_delivered,
        notifications_failed=notifications_failed,
        notifications_processing=notifications_processing,
        notifications_queued=notifications_queued,
        dlq_active=dlq_active,
        success_rate=round(success_rate, 1),
        avg_delivery_latency_ms=round(avg_latency, 1) if avg_latency is not None else None,
        channel_stats=channel_stats,
    )


async def get_trends(
    db: AsyncSession,
    api_key_id: uuid.UUID | None,
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    granularity: str = "hour",
) -> TrendResponse:
    """Return notification status counts bucketed by hour or day."""
    start = to_naive_utc(date_from) if date_from is not None else _today_start()
    end = to_naive_utc(date_to) if date_to is not None else None

    bucket = granularity if granularity in ("hour", "day") else "hour"
    time_trunc = func.date_trunc(bucket, Notification.created_at)

    rows = (
        await db.execute(
            select(
                time_trunc.label("ts"),
                col(Notification.status),
                func.count().label("cnt"),
            )
            .join(Event, col(Notification.event_id) == col(Event.id))
            .where(*([col(Event.api_key_id) == api_key_id] if api_key_id is not None else []))
            .where(col(Notification.created_at) >= start)
            .where(*([col(Notification.created_at) <= end] if end is not None else []))
            .group_by(time_trunc, col(Notification.status))
            .order_by(time_trunc)
        )
    ).all()

    bucket_map: dict[str, dict[str, int]] = {}
    for row in rows:
        key = row.ts.strftime("%Y-%m-%dT%H:%M:%S")
        if key not in bucket_map:
            bucket_map[key] = {"delivered": 0, "failed": 0, "queued": 0, "processing": 0}

        if row.status == NotificationStatus.DELIVERED:
            bucket_map[key]["delivered"] += row.cnt
        elif row.status in (NotificationStatus.FAILED, NotificationStatus.DEAD_LETTER):
            bucket_map[key]["failed"] += row.cnt
        elif row.status == NotificationStatus.QUEUED:
            bucket_map[key]["queued"] += row.cnt
        else:
            bucket_map[key]["processing"] += row.cnt

    points = [TrendPoint(timestamp=ts, **counts) for ts, counts in bucket_map.items()]
    return TrendResponse(points=points)
