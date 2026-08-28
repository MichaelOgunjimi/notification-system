"""Issue and validate human access and refresh tokens."""

import uuid
from typing import Any, cast

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings
from app.core.datetime import utc_now


def create_access_token(user_id: uuid.UUID) -> str:
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": utc_now(),
        "exp": utc_now() + settings.access_token_expire,
    }
    return cast(str, jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM))


def create_refresh_token(user_id: uuid.UUID) -> tuple[str, str]:
    jti = str(uuid.uuid4())
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": jti,
        "iat": utc_now(),
        "exp": utc_now() + settings.refresh_token_expire,
    }
    token = cast(
        str,
        jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM),
    )
    return token, jti


def decode_token(token: str, *, expected_type: str | None = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if expected_type is not None and payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Expected a {expected_type} token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return cast(dict[str, Any], payload)
