"""Analytics endpoints — GET /analytics for delivery metrics."""

from datetime import datetime

from fastapi import APIRouter, Query
from sqlmodel import col

from app.core.http.dependencies import SessionDep
from app.modules.credentials.dependencies import AnalyticsReadApiKeyDep, api_key_filter_id
from app.modules.events.model import Event
from app.modules.observability.analytics import service as analytics_service
from app.modules.observability.analytics.schemas import AnalyticsResponse, TrendResponse

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
    api_key: AnalyticsReadApiKeyDep,
) -> AnalyticsResponse:
    """Return delivery metrics and channel statistics for a date range (defaults to today)."""
    return await analytics_service.get_analytics(
        db,
        col(Event.api_key_id) == api_key_filter_id(api_key),
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/trends", response_model=TrendResponse)
async def get_trends(
    date_from: datetime | None = Query(
        default=None, description="Start of window (UTC). Defaults to today midnight."
    ),
    date_to: datetime | None = Query(
        default=None, description="End of window (UTC). Defaults to now."
    ),
    granularity: str = Query(default="hour", description="Bucket size: 'hour' or 'day'."),
    *,
    db: SessionDep,
    api_key: AnalyticsReadApiKeyDep,
) -> TrendResponse:
    """Return notification status counts bucketed by hour or day."""
    return await analytics_service.get_trends(
        db,
        col(Event.api_key_id) == api_key_filter_id(api_key),
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
    )
