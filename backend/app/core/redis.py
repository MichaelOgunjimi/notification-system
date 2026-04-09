"""Async Redis client — shared singleton for the FastAPI application."""

from redis.asyncio import Redis

from app.core.config import settings

_redis_client: Redis | None = None


def get_redis() -> Redis:
    """Return the shared async Redis client, creating it on first call."""
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
    return _redis_client
