"""Datetime utilities — timezone-aware UTC helpers."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(UTC)


def to_iso(dt: datetime) -> str:
    """Format a datetime as an ISO 8601 string."""
    return dt.isoformat()
