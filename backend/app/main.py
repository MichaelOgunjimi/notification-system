"""FastAPI application factory and lifespan management.

Creates and configures the FastAPI app with middleware, routers,
structured logging, and database lifecycle hooks.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.middleware import LoggingMiddleware, RequestIDMiddleware
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.redis import get_redis
from app.utils.logging import setup_logging

_MAX_BODY_BYTES = settings.MAX_REQUEST_BODY_BYTES


class _BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose Content-Length exceeds the configured limit.

    Prevents a malicious or buggy client from sending a multi-GB batch
    payload that would be fully buffered in memory before Pydantic validation.
    """

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001, ANN201
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > _MAX_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large (limit {_MAX_BODY_BYTES} bytes)"},
            )
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
    app.add_middleware(_BodySizeLimitMiddleware)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.include_router(api_v1_router, prefix="/api/v1")
    return app


app = create_app()
