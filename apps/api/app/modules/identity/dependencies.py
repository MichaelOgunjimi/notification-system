"""Resolve authenticated human users from access tokens."""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlmodel import col

from app.core.http.dependencies import SessionDep
from app.modules.identity.models.user import User
from app.modules.identity.tokens import decode_token

_bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_scheme)],
    *,
    db: SessionDep,
) -> User:
    payload = decode_token(credentials.credentials, expected_type="access")
    try:
        user_id = uuid.UUID(str(payload.get("sub", "")))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    result = await db.execute(select(User).where(col(User.id) == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
