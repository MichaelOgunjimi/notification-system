"""Audit log endpoints."""

from datetime import datetime

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlmodel import col

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.modules.credentials.dependencies import AuditReadApiKeyDep
from app.modules.observability.audit.model import AuditLog
from app.modules.observability.audit.schemas import AuditLogResponse

router = APIRouter(prefix="/audit-log", tags=["audit-log"])


@router.get("", response_model=PaginatedResponse[AuditLogResponse])
async def list_audit_log(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    action: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    *,
    db: SessionDep,
    api_key: AuditReadApiKeyDep,
) -> PaginatedResponse[AuditLogResponse]:
    filters = [col(AuditLog.api_key_id) == api_key.id]
    if action:
        filters.append(col(AuditLog.action).ilike(f"%{action}%"))
    if from_:
        naive_from = from_.replace(tzinfo=None) if from_.tzinfo else from_
        filters.append(col(AuditLog.created_at) >= naive_from)

    total_result = await db.execute(select(func.count()).select_from(AuditLog).where(*filters))
    total = int(total_result.scalar() or 0)

    offset = (page - 1) * per_page
    result = await db.execute(
        select(AuditLog)
        .where(*filters)
        .order_by(col(AuditLog.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    items = [AuditLogResponse.model_validate(item) for item in result.scalars().all()]
    return PaginatedResponse.create(items, total, page, per_page)
