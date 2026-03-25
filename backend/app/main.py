"""FastAPI application factory and lifespan management.

Creates and configures the FastAPI app with middleware, routers,
structured logging, and database lifecycle hooks.
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.middleware import LoggingMiddleware, RequestIDMiddleware
from app.api.v1.router import api_v1_router
from app.utils.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Notification System API",
        version="0.1.0",
        description="Event-driven notification system",
        lifespan=lifespan,
    )
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.include_router(api_v1_router, prefix="/api/v1")
    return app


app = create_app()
