"""Datetime utilities — UTC helpers."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current UTC time as a naive datetime (for TIMESTAMP WITHOUT TIME ZONE)."""
    return datetime.now(UTC).replace(tzinfo=None)


def to_iso(dt: datetime) -> str:
    """Format a datetime as an ISO 8601 string."""
    return dt.isoformat()
