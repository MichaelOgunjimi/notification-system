"""Custom middleware — request ID injection, logging, and error handling."""

import re
import time
import uuid
from datetime import UTC, datetime

import structlog
import structlog.contextvars
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlmodel import col
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.database import async_session
from app.models.api_key import ApiKey
from app.models.usage import ApiKeyUsage
from app.utils.crypto import hash_api_key

logger = structlog.get_logger(__name__)

# Collapse UUID path segments into {id} so usage rows group by route, not per-resource.
# e.g. /api/v1/templates/550e8400-... → /api/v1/templates/{id}
_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)

# Synthetic ID used for the master key — not stored in api_keys table, skip usage tracking
_MASTER_KEY_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Inject a unique request ID into every request/response cycle."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Log request method, path, status code, and duration."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=getattr(request.state, "request_id", None),
        )

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        await logger.ainfo(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
        )
        return response


class UsageTrackingMiddleware(BaseHTTPMiddleware):
    """Record per-hour API usage for requests authenticated by X-API-Key."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        api_key_id = getattr(request.state, "api_key_id", None)
        async with async_session() as db:
            if api_key_id is None:
                raw_key = request.headers.get("X-API-Key")
                if not raw_key:
                    return response
                key_hash = hash_api_key(raw_key)
                key_result = await db.execute(
                    select(col(ApiKey.id)).where(
                        col(ApiKey.key_hash) == key_hash,
                        col(ApiKey.is_active),
                        col(ApiKey.revoked_at).is_(None),
                    )
                )
                api_key_id = key_result.scalar_one_or_none()
                if api_key_id is None:
                    return response

            # Skip master key — its synthetic ID doesn't exist in api_keys table
            if api_key_id == _MASTER_KEY_ID:
                return response

            hour_bucket = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
            normalized_path = _UUID_RE.sub("{id}", request.url.path)
            stmt = insert(ApiKeyUsage).values(
                api_key_id=api_key_id,
                endpoint=normalized_path,
                method=request.method,
                status_code=response.status_code,
                hour_bucket=hour_bucket,
                request_count=1,
            )
            upsert_stmt = stmt.on_conflict_do_update(
                index_elements=[
                    "api_key_id",
                    "endpoint",
                    "method",
                    "status_code",
                    "hour_bucket",
                ],
                set_={"request_count": ApiKeyUsage.request_count + 1},
            )
            await db.execute(upsert_stmt)
            await db.commit()

        return response
