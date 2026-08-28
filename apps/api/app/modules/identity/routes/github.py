"""GitHub OAuth HTTP routes."""

import json
import secrets
import uuid
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.http.dependencies import RedisDep, SessionDep
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.identity.providers import github as github_provider
from app.modules.identity.service import (
    connect_oauth_account,
    create_user_tokens,
    get_or_create_oauth_user,
)

router = APIRouter(prefix="/oauth/github", tags=["oauth"])

_STATE_PREFIX = "oauth:state"


def _authorization_redirect(state: str) -> RedirectResponse:
    return RedirectResponse(github_provider.authorization_url(state))


@router.get("/login")
async def github_login(redis: RedisDep) -> RedirectResponse:
    """Start GitHub OAuth with a single-use, server-stored CSRF state."""
    github_provider.require_config()
    state = secrets.token_urlsafe(32)
    await redis.setex(
        f"{_STATE_PREFIX}:{state}",
        settings.OAUTH_STATE_TTL_SECONDS,
        "1",
    )
    return _authorization_redirect(state)


@router.get("/connect")
async def github_connect(user: CurrentUserDep, redis: RedisDep) -> RedirectResponse:
    """Connect GitHub to the currently authenticated internal user."""
    github_provider.require_config()
    state = secrets.token_urlsafe(32)
    await redis.setex(
        f"{_STATE_PREFIX}:{state}",
        settings.OAUTH_STATE_TTL_SECONDS,
        json.dumps({"connect_user_id": str(user.id)}),
    )
    return _authorization_redirect(state)


@router.get("/callback")
async def github_callback(
    code: str,
    state: str,
    db: SessionDep,
    redis: RedisDep,
) -> RedirectResponse:
    github_provider.require_config()
    stored_state = await redis.getdel(f"{_STATE_PREFIX}:{state}")
    if stored_state is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state",
        )

    if isinstance(stored_state, bytes):
        stored_state = stored_state.decode()
    connect_user_id: str | None = None
    if stored_state != "1":
        try:
            connect_user_id = str(json.loads(stored_state)["connect_user_id"])
        except (KeyError, TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OAuth state",
            ) from exc

    identity = await github_provider.exchange_identity(code)
    if connect_user_id is None:
        user = await get_or_create_oauth_user(db, "github", identity)
    else:
        try:
            user_id = uuid.UUID(connect_user_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OAuth state",
            ) from exc
        user = await connect_oauth_account(db, user_id, "github", identity)
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    tokens = await create_user_tokens(user, db, redis)
    fragment = urlencode(tokens.model_dump())
    return RedirectResponse(f"{settings.FRONTEND_URL.rstrip('/')}/auth/callback#{fragment}")
