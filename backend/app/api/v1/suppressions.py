"""Suppression endpoints."""

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlmodel import col

from app.api.deps import ApiKeyDep, SessionDep
from app.models.enums import NotificationChannel
from app.models.suppression import Suppression
from app.schemas.common import PaginatedResponse
from app.schemas.suppressions import SuppressionCreate, SuppressionResponse
from app.utils.audit import log_action

router = APIRouter(prefix="/suppressions", tags=["suppressions"])


@router.get("", response_model=PaginatedResponse[SuppressionResponse])
async def list_suppressions(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    channel: NotificationChannel | None = Query(default=None),
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> PaginatedResponse[SuppressionResponse]:
    filters = [col(Suppression.api_key_id) == api_key.id]
    if channel:
        filters.append(col(Suppression.channel) == channel)

    total_result = await db.execute(select(func.count()).select_from(Suppression).where(*filters))
    total = int(total_result.scalar() or 0)

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Suppression)
        .where(*filters)
        .order_by(col(Suppression.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    items = [SuppressionResponse.model_validate(row) for row in result.scalars().all()]
    return PaginatedResponse.create(items, total, page, per_page)


@router.post("", response_model=SuppressionResponse, status_code=status.HTTP_201_CREATED)
async def create_suppression(
    body: SuppressionCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
) -> SuppressionResponse:
    suppression = Suppression(
        api_key_id=api_key.id,
        channel=body.channel,
        recipient=body.recipient,
        reason=body.reason,
    )
    try:
        db.add(suppression)
        await db.flush()
        await log_action(
            db,
            api_key_id=api_key.id,
            action="suppression.added",
            resource_type="suppression",
            resource_id=str(suppression.id),
            metadata={"channel": str(suppression.channel), "recipient": suppression.recipient},
            ip_address=request.client.host if request.client else None,
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Suppression already exists",
        ) from exc
    await db.refresh(suppression)
    return SuppressionResponse.model_validate(suppression)


@router.delete("/{suppression_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_suppression(
    suppression_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
) -> None:
    result = await db.execute(
        select(Suppression).where(
            col(Suppression.id) == suppression_id,
            col(Suppression.api_key_id) == api_key.id,
        )
    )
    suppression = result.scalar_one_or_none()
    if suppression is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suppression not found")

    await db.delete(suppression)
    await db.flush()
    await log_action(
        db,
        api_key_id=api_key.id,
        action="suppression.removed",
        resource_type="suppression",
        resource_id=str(suppression_id),
        metadata={"channel": str(suppression.channel), "recipient": suppression.recipient},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
