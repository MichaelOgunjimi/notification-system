"""Analytics endpoints — GET /analytics for delivery metrics."""

from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import ApiKeyDep, SessionDep, api_key_filter_id
from app.schemas.analytics import AnalyticsResponse
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("", response_model=AnalyticsResponse)
async def get_analytics(
    date_from: datetime | None = Query(
        default=None, description="Start of window (UTC). Defaults to today midnight."
    ),
    date_to: datetime | None = Query(
        default=None, description="End of window (UTC). Defaults to now."
    ),
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> AnalyticsResponse:
    """Return delivery metrics and channel statistics for a date range (defaults to today)."""
    return await analytics_service.get_analytics(
        db, api_key_filter_id(api_key), date_from=date_from, date_to=date_to
    )
