"""Magic-link registration and login behavior."""

import json
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User
from app.modules.tenancy.models.organization import Organization, OrganizationMembership
from app.modules.tenancy.models.project import Project


async def test_request_magic_link_sends_one_time_link_without_exposing_account_state(
    client: AsyncClient,
    mock_redis: AsyncMock,
) -> None:
    with patch("app.modules.identity.service.EmailAdapter.send") as send_email:
        response = await client.post(
            "/api/v1/auth/magic-link/request",
            json={"email": "  New.User@Example.COM  "},
        )

    assert response.status_code == 202
    assert response.json() == {
        "message": "If the address can receive email, a sign-in link has been sent."
    }
    cache_key, ttl, stored_value = mock_redis.setex.await_args.args
    assert cache_key.startswith("magic_link:")
    assert ttl == settings.MAGIC_LINK_TTL_SECONDS
    assert json.loads(stored_value) == {"email": "new.user@example.com"}

    send_call = send_email.call_args
    assert send_call.args[0] == "new.user@example.com"
    assert send_call.args[1] == "Your private link to Beaco"
    assert f"{settings.FRONTEND_URL}/auth/magic-link?token=" in send_call.args[2]
    assert "beaco-lockup-horizontal-dark.png" in send_call.args[2]
    assert "beaco-mark-on-light.png" in send_call.args[2]
    assert "beaco-mark-128.png" in send_call.args[2]
    assert "plain_text" in send_call.kwargs


async def test_request_magic_link_carries_a_safe_relative_next_path(
    client: AsyncClient,
    mock_redis: AsyncMock,
) -> None:
    with patch("app.modules.identity.service.EmailAdapter.send") as send_email:
        response = await client.post(
            "/api/v1/auth/magic-link/request",
            json={
                "email": "invitee@example.com",
                "next": "/invitations/accept?token=abc123_-def",
            },
        )

    assert response.status_code == 202
    sent_body = send_email.call_args.args[2]
    assert f"{settings.FRONTEND_URL}/auth/magic-link?token=" in sent_body
    assert "next=%2Finvitations%2Faccept%3Ftoken%3Dabc123_-def" in sent_body


async def test_request_magic_link_drops_an_open_redirect_next_path(
    client: AsyncClient,
    mock_redis: AsyncMock,
) -> None:
    for hostile in ("https://evil.example.com", "//evil.example.com", "/\\evil.example.com"):
        with patch("app.modules.identity.service.EmailAdapter.send") as send_email:
            response = await client.post(
                "/api/v1/auth/magic-link/request",
                json={"email": "invitee@example.com", "next": hostile},
            )
        assert response.status_code == 202
        assert "next=" not in send_email.call_args.args[2]


async def test_verified_email_magic_link_signs_in_existing_user(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    user = User(email="existing@example.com", name="Existing User")
    db.add(user)
    await db.flush()
    db.add(
        EmailAddress(
            user_id=user.id,
            email="existing@example.com",
            is_primary=True,
            verified_at=utc_now(),
        )
    )
    await db.commit()
    mock_redis.getdel.return_value = json.dumps({"email": "existing@example.com"})

    response = await client.post(
        "/api/v1/auth/magic-link/verify",
        json={"token": "one-time-magic-token"},
    )

    assert response.status_code == 200
    payload = jwt.decode(
        response.json()["access_token"],
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
    )
    assert payload["sub"] == str(user.id)
    mock_redis.getdel.assert_awaited_once()


async def test_verified_magic_link_registers_new_user_and_workspace(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    mock_redis.getdel.return_value = json.dumps({"email": "new.member@example.com"})

    response = await client.post(
        "/api/v1/auth/magic-link/verify",
        json={"token": "new-user-magic-token"},
    )

    assert response.status_code == 200
    user = (
        await db.execute(select(User).where(User.email == "new.member@example.com"))
    ).scalar_one()
    email_address = (
        await db.execute(select(EmailAddress).where(EmailAddress.user_id == user.id))
    ).scalar_one()
    assert email_address.is_primary is True
    assert email_address.verified_at is not None
    assert len((await db.execute(select(Organization))).scalars().all()) == 1
    assert len((await db.execute(select(OrganizationMembership))).scalars().all()) == 1
    assert len((await db.execute(select(Project))).scalars().all()) == 1


async def test_expired_or_reused_magic_link_is_rejected(
    client: AsyncClient,
    mock_redis: AsyncMock,
) -> None:
    mock_redis.getdel.return_value = None

    response = await client.post(
        "/api/v1/auth/magic-link/verify",
        json={"token": "already-consumed"},
    )

    assert response.status_code == 400
    assert "invalid or expired" in str(response.json()).lower()


async def test_magic_link_rate_limit_keeps_enumeration_safe_response(
    client: AsyncClient,
    mock_redis: AsyncMock,
) -> None:
    mock_redis.eval.return_value = settings.MAGIC_LINK_RATE_LIMIT_PER_HOUR + 1

    with patch("app.modules.identity.service.EmailAdapter.send") as send_email:
        response = await client.post(
            "/api/v1/auth/magic-link/request",
            json={"email": "rate-limited@example.com"},
        )

    assert response.status_code == 202
    send_email.assert_not_called()
    mock_redis.setex.assert_not_awaited()
