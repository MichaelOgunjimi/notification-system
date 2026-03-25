"""Health check endpoints — /health, /health/ready, /health/live."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.schemas.common import HealthResponse
from app.utils.datetime import utc_now

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
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
