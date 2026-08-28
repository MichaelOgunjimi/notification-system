"""GitHub OAuth adapter."""

from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
_TOKEN_URL = "https://github.com/login/oauth/access_token"
_USER_URL = "https://api.github.com/user"
_EMAILS_URL = "https://api.github.com/user/emails"
_SCOPE = "read:user user:email"


def callback_url() -> str:
    return f"{settings.BACKEND_URL.rstrip('/')}/api/v1/oauth/github/callback"


def require_config() -> None:
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured",
        )


def authorization_url(state: str) -> str:
    query = urlencode(
        {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": callback_url(),
            "scope": _SCOPE,
            "state": state,
        }
    )
    return f"{_AUTHORIZE_URL}?{query}"


async def exchange_identity(code: str) -> dict[str, Any]:
    """Exchange one callback code and return a normalized verified identity."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_response = await client.post(
            _TOKEN_URL,
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": callback_url(),
            },
            headers={"Accept": "application/json"},
        )
        if token_response.status_code != 200 or not token_response.json().get("access_token"):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="GitHub token exchange failed",
            )

        headers = {
            "Authorization": f"Bearer {token_response.json()['access_token']}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        profile_response = await client.get(_USER_URL, headers=headers)
        if profile_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="GitHub user lookup failed",
            )
        profile: dict[str, Any] = profile_response.json()
        email = profile.get("email")
        if not email:
            emails_response = await client.get(_EMAILS_URL, headers=headers)
            if emails_response.status_code == 200:
                verified = [item for item in emails_response.json() if item.get("verified")]
                primary = next((item for item in verified if item.get("primary")), None)
                selected = primary or (verified[0] if verified else None)
                email = selected.get("email") if selected else None

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub did not provide a verified email address",
        )
    return {
        "id": str(profile.get("id", "")),
        "login": str(profile.get("login", "")),
        "name": profile.get("name") or profile.get("login"),
        "email": str(email),
        "avatar_url": profile.get("avatar_url"),
    }
