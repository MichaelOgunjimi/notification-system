"""Datetime utilities — UTC helpers."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current UTC time as a naive datetime (for TIMESTAMP WITHOUT TIME ZONE)."""
    return datetime.now(UTC).replace(tzinfo=None)


def to_naive_utc(dt: datetime) -> datetime:
    """Convert a datetime to naive UTC (for TIMESTAMP WITHOUT TIME ZONE columns).

    If tz-aware, converts to UTC first then strips tzinfo.
    If already naive, assumes UTC and returns as-is.
    """
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def to_iso(dt: datetime) -> str:
    """Format a datetime as an ISO 8601 string."""
    return dt.isoformat()
