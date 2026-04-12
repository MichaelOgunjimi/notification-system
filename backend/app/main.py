"""FastAPI application factory and lifespan management.

Creates and configures the FastAPI app with middleware, routers,
structured logging, and database lifecycle hooks.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.middleware import LoggingMiddleware, RequestIDMiddleware, UsageTrackingMiddleware
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.redis import get_redis
from app.utils.logging import setup_logging

_MAX_BODY_BYTES = settings.MAX_REQUEST_BODY_BYTES


class _BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose body exceeds the configured limit.

    Checks Content-Length for well-behaved clients (fast path) and falls back
    to streaming the body for chunked transfer encoding, which carries no
    Content-Length header. Both paths are required — checking only
    Content-Length leaves chunked requests fully bypassable.
    """

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001, ANN201
        # Fast path: well-behaved clients declare Content-Length.
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > _MAX_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large (limit {_MAX_BODY_BYTES} bytes)"},
            )

        # Safe path: stream and count bytes for clients that omit Content-Length
        # (e.g. chunked transfer encoding). Buffer the body so downstream can
        # still read it via request.body().
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > _MAX_BODY_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": f"Request body too large (limit {_MAX_BODY_BYTES} bytes)"},
                )
        request._body = body  # re-inject so route handlers can call await request.body()
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    yield
    await get_redis().aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Notification System API",
        version="0.1.0",
        description="Event-driven notification system",
        lifespan=lifespan,
    )
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(UsageTrackingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Added last → runs first on every incoming request.
    # Must be outermost so oversized payloads are rejected before logging overhead.
    app.add_middleware(_BodySizeLimitMiddleware)
    app.include_router(api_v1_router, prefix="/api/v1")
    return app


app = create_app()
