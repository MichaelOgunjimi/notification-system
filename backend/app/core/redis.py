"""Async Redis client — shared singleton for the FastAPI application."""

import asyncio

from redis.asyncio import ConnectionPool, Redis

from app.core.config import settings

_redis_client: Redis | None = None
_pool: ConnectionPool | None = None
_redis_loop_id: int | None = None


def get_redis() -> Redis:
    """Return the shared async Redis client, creating it on first call."""
    global _redis_client, _pool, _redis_loop_id
    current_loop_id: int | None = None
    try:
        current_loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        current_loop_id = None

    should_recreate = _redis_client is None or (
        _redis_loop_id is not None
        and current_loop_id is not None
        and _redis_loop_id != current_loop_id
    )
    if should_recreate:
        _pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        _redis_client = Redis(connection_pool=_pool)
        _redis_loop_id = current_loop_id
    assert _redis_client is not None
    return _redis_client


async def close_redis() -> None:
    """Close the Redis client and connection pool. Called during app shutdown."""
    global _redis_client, _pool, _redis_loop_id
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None
    if _pool is not None:
        await _pool.aclose()
        _pool = None
    _redis_loop_id = None
