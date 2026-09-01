"""Magic-link and session HTTP routes."""

from fastapi import APIRouter, Response, status

from app.core.http.dependencies import RedisDep, SessionDep
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.identity.models.user import User
from app.modules.identity.schemas import (
    MagicLinkRequest,
    MagicLinkVerifyRequest,
    MessageResponse,
    OAuthCodeExchangeRequest,
    RefreshRequest,
    TokenResponse,
    UserProfileUpdate,
    UserResponse,
)
from app.modules.identity.service import (
    exchange_oauth_authorization_code,
    refresh_access_token,
    request_magic_link,
    revoke_refresh_token,
    update_user_profile,
    verify_magic_link,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_MAGIC_LINK_RESPONSE = "If the address can receive email, a sign-in link has been sent."


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    body: RefreshRequest,
    *,
    db: SessionDep,
    redis: RedisDep,
) -> TokenResponse:
    return await refresh_access_token(body.refresh_token, db, redis)


@router.post(
    "/magic-link/request",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def send_magic_link(
    body: MagicLinkRequest,
    redis: RedisDep,
) -> MessageResponse:
    await request_magic_link(body.email, redis)
    return MessageResponse(message=_MAGIC_LINK_RESPONSE)


@router.post("/magic-link/verify", response_model=TokenResponse)
async def consume_magic_link(
    body: MagicLinkVerifyRequest,
    *,
    db: SessionDep,
    redis: RedisDep,
) -> TokenResponse:
    return await verify_magic_link(body.token, db, redis)


@router.post("/oauth/exchange", response_model=TokenResponse)
async def exchange_oauth_code(
    body: OAuthCodeExchangeRequest,
    *,
    db: SessionDep,
    redis: RedisDep,
) -> TokenResponse:
    return await exchange_oauth_authorization_code(body.code, db, redis)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: RefreshRequest,
    *,
    db: SessionDep,
    redis: RedisDep,
) -> Response:
    await revoke_refresh_token(body.refresh_token, db, redis)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserResponse)
async def get_me(user: CurrentUserDep) -> User:
    """Return the profile for the authenticated human user."""
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserProfileUpdate,
    *,
    user: CurrentUserDep,
    db: SessionDep,
) -> User:
    """Update user-owned profile fields without changing login identity."""
    return await update_user_profile(
        db,
        user=user,
        changes=body.model_dump(exclude_unset=True),
    )
