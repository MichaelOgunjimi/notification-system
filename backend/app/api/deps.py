"""FastAPI dependency injection — database sessions, auth, and settings."""

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import validate_api_key, verify_master_key_value
from app.models.api_key import ApiKey

SessionDep = Annotated[AsyncSession, Depends(get_db)]
MASTER_KEY_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")


async def get_current_api_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
    *,
    db: SessionDep,
) -> ApiKey:
    """Validate the X-API-Key header and return the corresponding ApiKey model."""
    if settings.MASTER_API_KEY and verify_master_key_value(x_api_key, settings.MASTER_API_KEY):
        return ApiKey(
            id=MASTER_KEY_ID,
            name="Master",
            key_prefix=x_api_key[:10],
            key_hash="",
            is_active=True,
        )

    api_key = await validate_api_key(db, x_api_key)
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
        )
    return api_key


async def verify_master_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
) -> None:
    """Verify that the provided key matches the MASTER_API_KEY env var."""
    if not settings.MASTER_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Master API key not configured",
        )
    if not verify_master_key_value(x_api_key, settings.MASTER_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid master API key",
        )


def is_master_key(api_key: ApiKey) -> bool:
    """Return True if this ApiKey is the synthetic master key."""
    return api_key.id == MASTER_KEY_ID


def api_key_filter_id(api_key: ApiKey) -> uuid.UUID | None:
    """Returns None for master key, or api_key.id for regular keys."""
    return None if is_master_key(api_key) else api_key.id


ApiKeyDep = Annotated[ApiKey, Depends(get_current_api_key)]
MasterKeyDep = Annotated[None, Depends(verify_master_key)]
