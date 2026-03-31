"""FastAPI dependency injection — database sessions, auth, and settings."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import validate_api_key, verify_master_key_value
from app.models.api_key import ApiKey

SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def get_current_api_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
    *,
    db: SessionDep,
) -> ApiKey:
    """Validate the X-API-Key header and return the corresponding ApiKey model."""
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


ApiKeyDep = Annotated[ApiKey, Depends(get_current_api_key)]
MasterKeyDep = Annotated[None, Depends(verify_master_key)]
