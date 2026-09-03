"""Human identity provisioning and session lifecycle."""

import asyncio
import hashlib
import json
import secrets
import uuid
from enum import StrEnum
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.delivery.adapters.email import EmailAdapter
from app.modules.delivery.templates.transactional import magic_link_email
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.oauth_account import OAuthAccount
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.identity.schemas import TokenResponse
from app.modules.identity.tokens import create_access_token, create_refresh_token, decode_token
from app.modules.tenancy.lifecycle import create_organization_with_project

_REFRESH_PREFIX = "refresh"
_MAGIC_LINK_PREFIX = "magic_link"
_OAUTH_CODE_PREFIX = "oauth_code"
_MAGIC_LINK_RATE_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
"""


class EmailConflictPolicy(StrEnum):
    REJECT_OPERATION = "reject_operation"
    SKIP_ATTACHMENT = "skip_attachment"


def refresh_cache_key(jti: str) -> str:
    return f"{_REFRESH_PREFIX}:{jti}"


def magic_link_cache_key(token: str) -> str:
    digest = hashlib.sha256(token.encode()).hexdigest()
    return f"{_MAGIC_LINK_PREFIX}:{digest}"


def oauth_code_cache_key(code: str) -> str:
    digest = hashlib.sha256(code.encode()).hexdigest()
    return f"{_OAUTH_CODE_PREFIX}:{digest}"


async def _create_user_with_workspace(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    avatar_url: str | None = None,
) -> tuple[User, EmailAddress]:
    verified_at = utc_now()
    user = User(
        email=email,
        name=name,
        avatar_url=avatar_url,
        email_verified_at=verified_at,
    )
    db.add(user)
    await db.flush()
    email_address = EmailAddress(
        user_id=user.id,
        email=email,
        is_primary=True,
        verified_at=verified_at,
    )
    db.add(email_address)
    await create_organization_with_project(
        db,
        owner=user,
        name=f"{user.name}'s Workspace",
        slug=f"workspace-{str(user.id)[:8]}",
    )
    return user, email_address


async def _attach_verified_email(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    email: str,
    conflict_policy: EmailConflictPolicy,
) -> EmailAddress | None:
    email_result = await db.execute(select(EmailAddress).where(col(EmailAddress.email) == email))
    email_address = email_result.scalar_one_or_none()
    if email_address is not None:
        if email_address.user_id != user_id:
            if conflict_policy == EmailConflictPolicy.REJECT_OPERATION:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This provider email belongs to another user",
                )
            return None
        if email_address.verified_at is None:
            email_address.verified_at = utc_now()
            db.add(email_address)
        return email_address

    primary_result = await db.execute(
        select(col(EmailAddress.id)).where(
            col(EmailAddress.user_id) == user_id,
            col(EmailAddress.is_primary).is_(True),
        )
    )
    email_address = EmailAddress(
        user_id=user_id,
        email=email,
        is_primary=primary_result.scalar_one_or_none() is None,
        verified_at=utc_now(),
    )
    db.add(email_address)
    return email_address


async def request_magic_link(email: str, redis: Redis) -> None:
    email_digest = hashlib.sha256(email.encode()).hexdigest()
    request_count = int(
        await redis.eval(  # type: ignore[misc]
            _MAGIC_LINK_RATE_SCRIPT,
            1,
            f"magic_link_rate:{email_digest}",
            "3600",
        )
    )
    if request_count > settings.MAGIC_LINK_RATE_LIMIT_PER_HOUR:
        return

    token = secrets.token_urlsafe(32)
    await redis.setex(
        magic_link_cache_key(token),
        settings.MAGIC_LINK_TTL_SECONDS,
        json.dumps({"email": email}),
    )
    link = f"{settings.FRONTEND_URL.rstrip('/')}/auth/magic-link?token={quote(token)}"
    email_message = magic_link_email(
        frontend_url=settings.FRONTEND_URL,
        recipient=email,
        recipient_name=email.partition("@")[0],
        action_url=link,
        expires_minutes=max(1, settings.MAGIC_LINK_TTL_SECONDS // 60),
    )
    adapter = EmailAdapter()
    result = await asyncio.to_thread(
        adapter.send,
        email,
        email_message.subject,
        email_message.html,
        plain_text=email_message.text,
    )
    if not result.success:
        await redis.delete(magic_link_cache_key(token))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to send sign-in email",
        )


async def verify_magic_link(
    token: str,
    db: AsyncSession,
    redis: Redis,
) -> TokenResponse:
    raw_payload = await redis.getdel(magic_link_cache_key(token))
    if isinstance(raw_payload, bytes):
        raw_payload = raw_payload.decode()
    if not raw_payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired magic link",
        )
    try:
        email = str(json.loads(raw_payload)["email"])
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired magic link",
        ) from exc

    email_result = await db.execute(select(EmailAddress).where(col(EmailAddress.email) == email))
    email_address = email_result.scalar_one_or_none()
    if email_address is None:
        _user, email_address = await _create_user_with_workspace(
            db,
            email=email,
            name=email.partition("@")[0],
        )
        await db.commit()
    if email_address.verified_at is None:
        email_address.verified_at = utc_now()
        db.add(email_address)
        await db.commit()

    user_result = await db.execute(select(User).where(col(User.id) == email_address.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return await create_user_tokens(user, db, redis)


async def get_or_create_oauth_user(
    db: AsyncSession,
    provider: str,
    identity: dict[str, Any],
) -> User:
    provider_account_id = str(identity["id"])
    result = await db.execute(
        select(OAuthAccount).where(
            col(OAuthAccount.provider) == provider,
            col(OAuthAccount.provider_account_id) == provider_account_id,
        )
    )
    account = result.scalar_one_or_none()
    if account is not None:
        user_result = await db.execute(select(User).where(col(User.id) == account.user_id))
        user = user_result.scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Linked {provider} user was not found",
            )
        provider_email = str(identity["email"]).lower()
        attached_email = await _attach_verified_email(
            db,
            user_id=user.id,
            email=provider_email,
            conflict_policy=EmailConflictPolicy.SKIP_ATTACHMENT,
        )
        account.provider_email = provider_email
        account.email_conflict_at = utc_now() if attached_email is None else None
        account.provider_name = identity.get("name")
        account.provider_username = str(identity["login"])
        account.avatar_url = identity.get("avatar_url")
        db.add(account)
        await db.commit()
        return user

    email = str(identity["email"]).lower()
    email_result = await db.execute(select(EmailAddress).where(col(EmailAddress.email) == email))
    if email_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email already has an account; sign in and connect this provider",
        )

    user, _email_address = await _create_user_with_workspace(
        db,
        email=email,
        name=str(identity.get("name") or identity["login"]),
        avatar_url=identity.get("avatar_url"),
    )

    db.add(
        OAuthAccount(
            user_id=user.id,
            provider=provider,
            provider_account_id=provider_account_id,
            provider_email=email,
            provider_name=identity.get("name"),
            provider_username=str(identity["login"]),
            avatar_url=identity.get("avatar_url"),
        )
    )
    await db.commit()
    await db.refresh(user)
    return user


async def update_user_profile(
    db: AsyncSession,
    *,
    user: User,
    changes: dict[str, object],
) -> User:
    """Persist authenticated user-owned profile fields.

    Args:
        db: Active identity database session.
        user: Authenticated user resolved from the bearer access token.
        changes: Validated partial profile fields from the HTTP schema.

    Returns:
        The refreshed user record after committing the profile update.

    Side Effects:
        Commits the active database transaction and advances ``updated_at``.
    """
    for field, value in changes.items():
        setattr(user, field, value)
    user.updated_at = utc_now()
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def list_oauth_connections(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> list[OAuthAccount]:
    """List external identities linked to one authenticated user.

    Args:
        db: Active identity database session.
        user_id: Authenticated user's stable application identifier.

    Returns:
        Connected provider accounts ordered by their original connection time.

    Security:
        Callers must supply the user identifier resolved from the access token;
        provider records are never queried by a browser-provided user ID.
    """
    result = await db.execute(
        select(OAuthAccount)
        .where(col(OAuthAccount.user_id) == user_id)
        .order_by(col(OAuthAccount.created_at))
    )
    return list(result.scalars().all())


async def disconnect_oauth_account(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    provider: str,
) -> None:
    """Remove one provider connection from an authenticated user.

    Args:
        db: Active identity database session.
        user_id: Authenticated user's stable application identifier.
        provider: Provider key to disconnect.

    Raises:
        HTTPException: When the requested provider is not connected to the user.

    Side Effects:
        Deletes the OAuth account and commits the transaction. Verified email
        addresses already attached to the user are intentionally retained.
    """
    result = await db.execute(
        select(OAuthAccount).where(
            col(OAuthAccount.user_id) == user_id,
            col(OAuthAccount.provider) == provider,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No {provider} account is connected",
        )

    await db.delete(account)
    await db.commit()


async def connect_oauth_account(
    db: AsyncSession,
    user_id: uuid.UUID,
    provider: str,
    identity: dict[str, Any],
) -> User:
    provider_account_id = str(identity["id"])
    account_result = await db.execute(
        select(OAuthAccount).where(
            col(OAuthAccount.provider) == provider,
            col(OAuthAccount.provider_account_id) == provider_account_id,
        )
    )
    existing_account = account_result.scalar_one_or_none()
    if existing_account is not None and existing_account.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This OAuth account is already connected to another user",
        )

    user_result = await db.execute(select(User).where(col(User.id) == user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    provider_for_user_result = await db.execute(
        select(OAuthAccount).where(
            col(OAuthAccount.user_id) == user_id,
            col(OAuthAccount.provider) == provider,
        )
    )
    provider_for_user = provider_for_user_result.scalar_one_or_none()
    if provider_for_user is not None and provider_for_user.id != getattr(
        existing_account, "id", None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A {provider} account is already connected to this user",
        )

    email = str(identity["email"]).lower()
    await _attach_verified_email(
        db,
        user_id=user_id,
        email=email,
        conflict_policy=EmailConflictPolicy.REJECT_OPERATION,
    )

    if existing_account is None:
        existing_account = OAuthAccount(
            user_id=user_id,
            provider=provider,
            provider_account_id=provider_account_id,
        )
        if user.avatar_url is None:
            user.avatar_url = identity.get("avatar_url")
            db.add(user)
    existing_account.provider_email = email
    existing_account.provider_name = identity.get("name")
    existing_account.provider_username = str(identity["login"])
    existing_account.avatar_url = identity.get("avatar_url")
    db.add(existing_account)
    await db.commit()
    await db.refresh(user)
    return user


async def create_user_tokens(
    user: User,
    db: AsyncSession,
    redis: Redis,
) -> TokenResponse:
    access_token = create_access_token(user.id)
    refresh_token, jti = create_refresh_token(user.id)
    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            expires_at=utc_now() + settings.refresh_token_expire,
        )
    )
    await db.commit()
    await redis.setex(
        refresh_cache_key(jti),
        int(settings.refresh_token_expire.total_seconds()),
        str(user.id),
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


async def create_oauth_authorization_code(user: User, redis: Redis) -> str:
    """Create a short-lived, single-use code without issuing user tokens yet."""
    code = secrets.token_urlsafe(32)
    await redis.setex(
        oauth_code_cache_key(code),
        settings.OAUTH_CODE_TTL_SECONDS,
        str(user.id),
    )
    return code


async def exchange_oauth_authorization_code(
    code: str,
    db: AsyncSession,
    redis: Redis,
) -> TokenResponse:
    """Consume an OAuth code and issue a fresh user session exactly once."""
    user_id = await redis.getdel(oauth_code_cache_key(code))
    if isinstance(user_id, bytes):
        user_id = user_id.decode()
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth authorization code",
        )

    parsed_user_id = parse_user_id(str(user_id))
    user_result = await db.execute(select(User).where(col(User.id) == parsed_user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return await create_user_tokens(user, db, redis)


def parse_user_id(value: str | None) -> uuid.UUID:
    try:
        return uuid.UUID(value or "")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
        ) from exc


async def refresh_access_token(
    refresh_token: str,
    db: AsyncSession,
    redis: Redis,
) -> TokenResponse:
    """Issue a new access token, checking Redis before the refresh-token table."""
    payload = decode_token(refresh_token, expected_type="refresh")
    jti = payload.get("jti")
    if not isinstance(jti, str) or not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is missing its JTI",
        )

    user_id = await redis.get(refresh_cache_key(jti))
    if isinstance(user_id, bytes):
        user_id = user_id.decode()
    if not user_id:
        token_result = await db.execute(select(RefreshToken).where(col(RefreshToken.jti) == jti))
        stored_token = token_result.scalar_one_or_none()
        if stored_token is None or stored_token.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked",
            )
        if stored_token.expires_at <= utc_now():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has expired",
            )
        user_id = str(stored_token.user_id)
        remaining_ttl = int((stored_token.expires_at - utc_now()).total_seconds())
        if remaining_ttl > 0:
            await redis.setex(refresh_cache_key(jti), remaining_ttl, user_id)

    if payload.get("sub") != user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token subject does not match its session",
        )
    parsed_user_id = parse_user_id(user_id)
    user_result = await db.execute(select(User).where(col(User.id) == parsed_user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
    )


async def revoke_refresh_token(
    refresh_token: str,
    db: AsyncSession,
    redis: Redis,
) -> None:
    """Revoke a refresh session in both the fast cache and durable store."""
    payload = decode_token(refresh_token, expected_type="refresh")
    jti = payload.get("jti")
    if not isinstance(jti, str) or not jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is missing its JTI",
        )

    await redis.delete(refresh_cache_key(jti))
    token_result = await db.execute(select(RefreshToken).where(col(RefreshToken.jti) == jti))
    stored_token = token_result.scalar_one_or_none()
    if stored_token is not None and stored_token.revoked_at is None:
        stored_token.revoked_at = utc_now()
        db.add(stored_token)
        await db.commit()
