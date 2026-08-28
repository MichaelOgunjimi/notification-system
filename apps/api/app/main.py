"""FastAPI application factory and lifespan management.

Creates and configures the FastAPI app with middleware, routers,
structured logging, and database lifecycle hooks.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.exceptions import ErrorCode
from app.core.http.middleware import LoggingMiddleware, RequestIDMiddleware, UsageTrackingMiddleware
from app.core.http.rate_limit import RateLimitMiddleware
from app.core.logging import setup_logging
from app.core.redis import close_redis
from app.modules.tenancy.errors import (
    CapabilityDeniedError,
    SlugConflictError,
    TenancyError,
    TenantResourceNotFoundError,
)
from app.router import api_v1_router

_MAX_BODY_BYTES = settings.MAX_REQUEST_BODY_BYTES


class _SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add OWASP-recommended security headers to all responses."""

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001, ANN201
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "0"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
            )
        return response


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


def _status_to_error_code(status_code: int) -> ErrorCode:
    explicit_map: dict[int, ErrorCode] = {
        401: ErrorCode.UNAUTHORIZED,
        403: ErrorCode.FORBIDDEN,
        404: ErrorCode.NOT_FOUND,
        409: ErrorCode.CONFLICT,
        410: ErrorCode.GONE,
        413: ErrorCode.PAYLOAD_TOO_LARGE,
        422: ErrorCode.VALIDATION_ERROR,
        429: ErrorCode.RATE_LIMITED,
        502: ErrorCode.SERVICE_UNAVAILABLE,
        503: ErrorCode.SERVICE_UNAVAILABLE,
    }
    if status_code in explicit_map:
        return explicit_map[status_code]
    if 500 <= status_code <= 599:
        return ErrorCode.INTERNAL_ERROR
    if 400 <= status_code <= 499:
        return ErrorCode.BAD_REQUEST
    return ErrorCode.INTERNAL_ERROR


async def _request_validation_exception_handler(
    _request: Request,
    exc: Exception,
) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": ErrorCode.INTERNAL_ERROR,
                    "message": "Internal server error",
                }
            },
        )
    details = [
        {
            "field": ".".join(str(loc) for loc in error["loc"][1:]),
            "message": error["msg"],
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": ErrorCode.VALIDATION_ERROR,
                "message": "Request validation failed",
                "details": details,
            }
        },
    )


async def _http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": ErrorCode.INTERNAL_ERROR,
                    "message": "Internal server error",
                }
            },
        )
    code = _status_to_error_code(exc.status_code)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": str(exc.detail),
            }
        },
    )


async def _tenancy_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, TenantResourceNotFoundError):
        status_code = 404
        code = ErrorCode.NOT_FOUND
    elif isinstance(exc, CapabilityDeniedError):
        status_code = 403
        code = ErrorCode.FORBIDDEN
    elif isinstance(exc, SlugConflictError):
        status_code = 409
        code = ErrorCode.CONFLICT
    else:
        status_code = 500
        code = ErrorCode.INTERNAL_ERROR
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": str(exc)}},
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    yield
    await close_redis()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Notification System API",
        version="0.1.0",
        description="Event-driven notification system",
        lifespan=lifespan,
    )
    app.add_middleware(_SecurityHeadersMiddleware)
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
    # Added before rate limiting so oversized payloads are rejected early.
    app.add_middleware(_BodySizeLimitMiddleware)
    # Added last → runs first on every request (Starlette executes middleware in reverse order).
    # This ensures 429 responses short-circuit before UsageTrackingMiddleware records usage.
    app.add_middleware(RateLimitMiddleware)
    app.add_exception_handler(HTTPException, _http_exception_handler)
    app.add_exception_handler(TenancyError, _tenancy_exception_handler)
    app.add_exception_handler(RequestValidationError, _request_validation_exception_handler)
    app.include_router(api_v1_router, prefix="/api/v1")
    return app


app = create_app()
