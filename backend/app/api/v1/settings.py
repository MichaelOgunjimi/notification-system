"""Settings endpoints — API key management, channel config, retry policies."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_api_key, get_db, verify_master_key
from app.models.api_key import ApiKey
from app.schemas.settings import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyResponse
from app.utils.crypto import generate_api_key, hash_api_key
from app.utils.datetime import utc_now

router = APIRouter(prefix="/settings", tags=["settings"])


@router.post(
    "/api-keys",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_master_key)],
)
async def create_api_key(
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
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


@router.get("/api-keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    _api_key: ApiKey = Depends(get_current_api_key),
) -> list[ApiKeyResponse]:
    result = await db.execute(
        select(ApiKey).where(ApiKey.is_active == True).order_by(ApiKey.created_at.desc())  # noqa: E712
    )
    keys = result.scalars().all()
    return [ApiKeyResponse.model_validate(k) for k in keys]


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _api_key: ApiKey = Depends(get_current_api_key),
) -> None:
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )

    api_key.is_active = False
    api_key.revoked_at = utc_now()
    db.add(api_key)
    await db.commit()
