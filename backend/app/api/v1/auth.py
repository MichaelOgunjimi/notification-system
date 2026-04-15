"""Auth routes — API key validation for the frontend login flow."""

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from app.api.deps import SessionDep
from app.core.config import settings
from app.core.security import validate_api_key, verify_master_key_value

router = APIRouter(prefix="/auth", tags=["auth"])


class ValidateResponse(BaseModel):
    valid: bool
    is_master: bool
    name: str
    key_prefix: str


@router.post("/validate", response_model=ValidateResponse)
async def validate_key(
    x_api_key: str = Header(..., alias="X-API-Key"),
    *,
    db: SessionDep,
) -> ValidateResponse:
    """Validate an API key and return its role.

    Returns ``is_master=True`` if the key matches ``MASTER_API_KEY``.
    Returns ``is_master=False`` for a valid project API key.
    Returns 401 for anything invalid.
    """
    # Check master key first (env-var comparison, no DB hit)
    if settings.MASTER_API_KEY and verify_master_key_value(x_api_key, settings.MASTER_API_KEY):
        return ValidateResponse(
            valid=True,
            is_master=True,
            name="Master",
            key_prefix="mk_••••••",
        )

    # Check regular project API key
    api_key = await validate_api_key(db, x_api_key)
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
        )

    return ValidateResponse(
        valid=True,
        is_master=False,
        name=api_key.name,
        key_prefix=api_key.key_prefix,
    )
