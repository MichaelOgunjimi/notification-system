"""Analytics endpoints — GET /analytics for delivery metrics."""

from fastapi import APIRouter

from app.api.deps import ApiKeyDep, SessionDep
from app.schemas.analytics import AnalyticsResponse
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("", response_model=AnalyticsResponse)
async def get_analytics(
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> AnalyticsResponse:
    """Return delivery metrics and channel statistics for today."""
    return await analytics_service.get_analytics(db, api_key.id)
