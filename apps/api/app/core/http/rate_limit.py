"""Redis-backed fixed-window HTTP rate limiting."""

import logging
import time

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
        limit = (
            settings.RATE_LIMIT_EVENTS
            if endpoint_category == "events"
            else settings.RATE_LIMIT_DEFAULT
        )

        minute_bucket = int(time.time() // 60)
        window_end = (minute_bucket + 1) * 60
        key = f"rl:{hash_api_key(raw_key)}:{endpoint_category}:{minute_bucket}"

        try:
            redis = get_redis()
            count = int(await redis.eval(_INCR_WITH_EXPIRE, 1, key, "60"))  # type: ignore[misc]
        except Exception:
            logger.warning(
                "Rate limit Redis operation failed for path %s; allowing request",
                request.url.path,
                exc_info=True,
            )
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(limit)
            response.headers["X-RateLimit-Reset"] = str(window_end)
            return response

        if count > limit:
            retry_after = max(0, window_end - int(time.time()))
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded. Try again in {retry_after} seconds.",
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(window_end),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - count))
        response.headers["X-RateLimit-Reset"] = str(window_end)
        return response
