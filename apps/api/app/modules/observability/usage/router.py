"""Usage tracking endpoint for API keys."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, select
from sqlmodel import col

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.modules.credentials.dependencies import UsageReadApiKeyDep
from app.modules.observability.usage.model import ApiKeyUsage
from app.modules.observability.usage.schemas import UsageResponse

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("", response_model=PaginatedResponse[UsageResponse])
async def get_usage(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    endpoint: str | None = Query(default=None),
    *,
    db: SessionDep,
    api_key: UsageReadApiKeyDep,
) -> PaginatedResponse[UsageResponse]:
    filters = [col(ApiKeyUsage.api_key_id) == api_key.id]
    if from_:
        filters.append(col(ApiKeyUsage.hour_bucket) >= from_)
    if to:
        filters.append(col(ApiKeyUsage.hour_bucket) <= to)
    if endpoint:
        filters.append(col(ApiKeyUsage.endpoint) == endpoint)

    grouped: Any = (
        select(
            col(ApiKeyUsage.api_key_id).label("api_key_id"),
            col(ApiKeyUsage.endpoint).label("endpoint"),
            col(ApiKeyUsage.hour_bucket).label("hour_bucket"),
            func.sum(col(ApiKeyUsage.request_count)).label("request_count"),
        )
        .where(and_(*filters))
        .group_by(
            col(ApiKeyUsage.api_key_id),
            col(ApiKeyUsage.endpoint),
            col(ApiKeyUsage.hour_bucket),
        )
    )

    count_query = select(func.count()).select_from(grouped.subquery())
    total_result = await db.execute(count_query)
    total = int(total_result.scalar() or 0)

    offset = (page - 1) * per_page
    result = await db.execute(
        grouped.order_by(col(ApiKeyUsage.hour_bucket).desc()).offset(offset).limit(per_page)
    )
    items = [
        UsageResponse(
            api_key_id=row.api_key_id,
            endpoint=row.endpoint,
            hour_bucket=row.hour_bucket,
            request_count=int(row.request_count),
        )
        for row in result.all()
    ]
    return PaginatedResponse.create(items, total, page, per_page)
