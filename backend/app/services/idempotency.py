"""Idempotency service — prevent duplicate event creation.

How it works
------------
When a client sends a request with an ``idempotency_key``, we:

1. Check Redis for ``idempotency:{api_key_id}:{key}``
   - Hit  → return the cached event_id immediately (fast path, ~1 ms)
   - Miss → fall through

2. Check the DB for an existing event with the same (api_key_id, idempotency_key).
   This covers Redis eviction, restarts, or first-boot with no warm cache.
   - Found → backfill Redis, return the existing event_id
   - Not found → caller creates the event, then calls ``store()`` to cache it

Why Redis AND DB?
  Redis can evict keys or restart. The DB unique constraint is the authoritative
  source of truth. Redis is purely a performance optimisation to avoid the DB
  lookup on the hot path. If Redis is unavailable we fall back to DB-only — no
  requests fail, they just get a slightly slower idempotency check.

Interview talking point: this two-layer check is the same pattern used by Stripe's
idempotency implementation. The DB constraint is the safety net; the cache is speed.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.redis import get_redis
from app.models.event import Event

logger = logging.getLogger(__name__)

# How long we keep idempotency keys in Redis (24 hours).
# Clients should not retry the same key after this window.
_TTL_SECONDS = 86_400


def _cache_key(api_key_id: uuid.UUID, idempotency_key: str) -> str:
    return f"idempotency:{api_key_id}:{idempotency_key}"


async def check(
    db: AsyncSession,
    api_key_id: uuid.UUID,
    idempotency_key: str,
) -> Event | None:
    """Return the existing Event if this (api_key_id, idempotency_key) was seen before.

    Returns None if this is a new request.
    """
    cache_key = _cache_key(api_key_id, idempotency_key)

    # --- Fast path: Redis ---
    try:
        redis = get_redis()
        cached_event_id = await redis.get(cache_key)
        if cached_event_id:
            event = await db.get(Event, cached_event_id)
            if event is not None:
                return event
            # Cache hit but event missing in DB — stale entry, fall through to DB check
            logger.warning(
                "Idempotency cache hit for key %s but event %s not found in DB — treating as new",
                cache_key,
                cached_event_id,
            )
    except Exception:
        logger.warning(
            "Redis unavailable during idempotency check for key %s — falling back to DB",
            cache_key,
            exc_info=True,
        )

    # --- Fallback: DB ---
    result = await db.execute(
        select(Event).where(
            col(Event.api_key_id) == api_key_id,
            col(Event.idempotency_key) == idempotency_key,
        )
    )
    event = result.scalar_one_or_none()

    if event is not None:
        # Backfill Redis so the next request hits the fast path
        await _store_in_redis(cache_key, str(event.id))

    return event


async def store(
    api_key_id: uuid.UUID,
    idempotency_key: str,
    event_id: uuid.UUID,
) -> None:
    """Cache a newly created event so future duplicates hit the fast path."""
    cache_key = _cache_key(api_key_id, idempotency_key)
    await _store_in_redis(cache_key, str(event_id))


async def _store_in_redis(cache_key: str, event_id: str) -> None:
    try:
        redis = get_redis()
        await redis.set(cache_key, event_id, ex=_TTL_SECONDS)
    except Exception:
        # Non-fatal — next request will do a DB check and backfill
        logger.warning(
            "Redis unavailable when caching idempotency key %s — will re-check DB on next request",
            cache_key,
            exc_info=True,
        )
