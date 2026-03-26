"""FastAPI dependency injection — database sessions, auth, and settings."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.config import settings
from app.database import get_db
from app.models.api_key import ApiKey
from app.utils.crypto import hash_api_key
from app.utils.datetime import utc_now

SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_api_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
    *,
    db: SessionDep,
) -> ApiKey:
    """Validate the X-API-Key header and return the corresponding ApiKey model."""
    key_hash = hash_api_key(x_api_key)
    result = await db.execute(select(ApiKey).where(col(ApiKey.key_hash) == key_hash))
    api_key = result.scalar_one_or_none()

    if api_key is None or not api_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
        )

    if api_key.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has been revoked",
        )

    api_key.last_used_at = utc_now()
    db.add(api_key)
    await db.commit()
    return api_key


async def verify_master_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> None:
    """Verify that the provided key matches the MASTER_API_KEY env var."""
    if not settings.MASTER_API_KEY:
        # No master key configured — allow unrestricted access for bootstrapping
        return
    if x_api_key != settings.MASTER_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid master API key",
        )


ApiKeyDep = Annotated[ApiKey, Depends(get_current_api_key)]
MasterKeyDep = Annotated[None, Depends(verify_master_key)]
