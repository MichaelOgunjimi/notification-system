"""Suppression endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlmodel import col, func

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.modules.credentials.dependencies import (
    SuppressionsReadApiKeyDep,
    SuppressionsWriteApiKeyDep,
)
from app.modules.notifications.enums import NotificationChannel
from app.modules.suppressions.enums import SuppressionReason, SuppressionSource
from app.modules.suppressions.model import Suppression

router = APIRouter(prefix="/suppressions", tags=["suppressions"])


class SuppressionResponse(BaseModel):
    id: uuid.UUID
    api_key_id: uuid.UUID
    channel: NotificationChannel
    recipient: str
    reason: SuppressionReason
    source: SuppressionSource
    created_at: datetime

    model_config = {"from_attributes": True}


class SuppressionCreate(BaseModel):
    channel: NotificationChannel
    recipient: str = Field(max_length=500)
    reason: SuppressionReason = SuppressionReason.MANUAL
    source: SuppressionSource = SuppressionSource.CLIENT


@router.get("", response_model=PaginatedResponse[SuppressionResponse])
async def list_suppressions(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    channel: NotificationChannel | None = Query(default=None),
    *,
    db: SessionDep,
    api_key: SuppressionsReadApiKeyDep,
) -> PaginatedResponse[SuppressionResponse]:
    filters = [col(Suppression.api_key_id) == api_key.id]
    if channel:
        filters.append(col(Suppression.channel) == channel)

    count_query = select(func.count()).select_from(Suppression)
    if filters:
        count_query = count_query.where(*filters)
    total = int((await db.execute(count_query)).scalar() or 0)

    offset = (page - 1) * per_page
    query = (
        select(Suppression)
        .order_by(col(Suppression.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    if filters:
        query = query.where(*filters)
    items = (await db.execute(query)).scalars().all()
    return PaginatedResponse.create(
        [SuppressionResponse.model_validate(item) for item in items], total, page, per_page
    )


@router.post("", response_model=SuppressionResponse, status_code=status.HTTP_201_CREATED)
async def create_suppression(
    body: SuppressionCreate,
    *,
    db: SessionDep,
    api_key: SuppressionsWriteApiKeyDep,
) -> SuppressionResponse:
    suppression = Suppression(
        api_key_id=api_key.id,
        channel=body.channel,
        recipient=body.recipient.lower(),
        reason=body.reason,
        source=body.source,
    )
    db.add(suppression)
    await db.commit()
    await db.refresh(suppression)
    return SuppressionResponse.model_validate(suppression)


@router.delete("/{suppression_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_suppression(
    suppression_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: SuppressionsWriteApiKeyDep,
) -> None:
    suppression = (
        await db.execute(select(Suppression).where(col(Suppression.id) == suppression_id))
    ).scalar_one_or_none()
    if suppression is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suppression not found")
    if suppression.api_key_id != api_key.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suppression not found")

    await db.delete(suppression)
    await db.commit()
