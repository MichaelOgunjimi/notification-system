"""Settings endpoints — API key management, channel config, retry policies."""

import uuid

from app.schemas.common import PaginatedResponse
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, func

from app.api.deps import MasterKeyDep, SessionDep
from app.models.api_key import ApiKey
from app.schemas.settings import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyResponse
from app.utils.crypto import generate_api_key, hash_api_key
from app.utils.datetime import utc_now

router = APIRouter(prefix="/settings", tags=["settings"])


@router.post(
    "/api-keys",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key(
    body: ApiKeyCreate,
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> ApiKeyCreateResponse:
    raw_key = generate_api_key()
    key_hash = hash_api_key(raw_key)
    key_prefix = raw_key[:7]

    api_key = ApiKey(
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=body.name,
        rate_limit_per_min=body.rate_limit_per_min,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return ApiKeyCreateResponse(
        id=api_key.id,
        key=raw_key,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        is_active=api_key.is_active,
        rate_limit_per_min=api_key.rate_limit_per_min,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
    )


@router.get("/api-keys", response_model=PaginatedResponse[ApiKeyResponse])
async def list_api_keys(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    *,
    db: SessionDep,
    _: MasterKeyDep,
) -> PaginatedResponse[ApiKeyResponse]:
    count_result = await db.execute(
        select(func.count()).select_from(ApiKey).where(col(ApiKey.is_active))
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        select(ApiKey)
        .where(col(ApiKey.is_active))
        .order_by(col(ApiKey.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    keys = result.scalars().all()
    return PaginatedResponse.create(
        [ApiKeyResponse.model_validate(k) for k in keys], total, page, per_page
    )


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: uuid.UUID,
    body: ApiKeyCreate,
    *,
    db: SessionDep,
) -> None:
    result = await db.execute(select(ApiKey).where(col(ApiKey.id) == key_id))
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    api_key.is_active = False
    api_key.revoked_at = utc_now()
    db.add(api_key)
    await db.commit()
