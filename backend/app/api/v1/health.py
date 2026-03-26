"""Health check endpoints — /health, /health/ready, /health/live."""

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import SessionDep
from app.config import settings
from app.schemas.common import HealthResponse
from app.utils.datetime import utc_now

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(*, db: SessionDep) -> HealthResponse:
    db_connected = False
    try:
        await db.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        pass

    return HealthResponse(
        status="healthy" if db_connected else "degraded",
        version=settings.APP_VERSION,
        database=db_connected,
        timestamp=utc_now(),
    )
