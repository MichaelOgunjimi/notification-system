"""Redis-backed fixed-window HTTP rate limiting."""

import logging
import time
from dataclasses import dataclass

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.crypto import hash_api_key
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

# Atomically increment counter and set TTL on first request.
# Using Lua ensures INCR + EXPIRE are a single Redis operation — no orphaned keys.
_INCR_WITH_EXPIRE = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
"""


@dataclass(frozen=True, slots=True)
class RateLimitState:
    """Outcome of counting one request against a key's per-minute window."""

    limit: int
    count: int
    window_end: int
    counted: bool  # False when Redis failed and the request is let through

    @property
    def allowed(self) -> bool:
        return self.count <= self.limit

    @property
    def remaining(self) -> int:
        return max(0, self.limit - self.count) if self.counted else self.limit

    @property
    def retry_after(self) -> int:
        return max(0, self.window_end - int(time.time()))

    def headers(self) -> dict[str, str]:
        return {
            "X-RateLimit-Limit": str(self.limit),
            "X-RateLimit-Remaining": str(self.remaining),
            "X-RateLimit-Reset": str(self.window_end),
        }

    def exceeded_response(self) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Rate limit exceeded. Try again in {self.retry_after} seconds.",
                "retry_after": self.retry_after,
            },
            headers={"Retry-After": str(self.retry_after), **self.headers()},
        )


async def consume_rate_limit(key_hash: str, endpoint_category: str) -> RateLimitState:
    """Count one request in the key's fixed one-minute window.

    ``key_hash`` is ``hash_api_key(raw_key)``, which is what ``ApiKey.key_hash`` stores, so a
    caller that has the stored key (not the raw secret) shares the same bucket as the key's
    header-authenticated traffic. Redis failures let the request through.
    """
    limit = (
        settings.RATE_LIMIT_EVENTS if endpoint_category == "events" else settings.RATE_LIMIT_DEFAULT
    )
    minute_bucket = int(time.time() // 60)
    window_end = (minute_bucket + 1) * 60
    key = f"rl:{key_hash}:{endpoint_category}:{minute_bucket}"
    try:
        redis = get_redis()
        count = int(await redis.eval(_INCR_WITH_EXPIRE, 1, key, "60"))  # type: ignore[misc]
    except Exception:
        logger.warning("Rate limit Redis operation failed for key bucket; allowing", exc_info=True)
        return RateLimitState(limit=limit, count=0, window_end=window_end, counted=False)
    return RateLimitState(limit=limit, count=count, window_end=window_end, counted=True)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply per-minute fixed-window rate limits per API key."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        raw_key = request.headers.get("X-API-Key")
        if not raw_key:
            return await call_next(request)

        endpoint_category = (
            "events"
            if request.method == "POST" and request.url.path.startswith("/api/v1/events")
            else "general"
        )
        state = await consume_rate_limit(hash_api_key(raw_key), endpoint_category)
        if not state.allowed:
            return state.exceeded_response()

        response = await call_next(request)
        response.headers.update(state.headers())
        return response
