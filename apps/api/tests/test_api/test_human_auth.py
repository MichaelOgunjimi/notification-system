"""Human JWT access and refresh-token endpoint tests."""

from unittest.mock import AsyncMock

from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.oauth_account import OAuthAccount
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens
from app.modules.identity.tokens import decode_token


async def test_refresh_uses_cached_jti_before_refresh_token_database(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    user = User(email="cached@example.com", name="Cached User")
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)

    await db.execute(delete(RefreshToken))
    await db.commit()
    mock_redis.reset_mock()
    mock_redis.get.return_value = str(user.id)

    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens.refresh_token},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"] == tokens.refresh_token
    mock_redis.get.assert_awaited_once()
    mock_redis.setex.assert_not_awaited()


async def test_refresh_falls_back_to_database_and_repairs_cache(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    user = User(email="fallback@example.com", name="Fallback User")
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)
    payload = decode_token(tokens.refresh_token, expected_type="refresh")

    mock_redis.reset_mock()
    mock_redis.get.return_value = None

    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens.refresh_token},
    )

    assert response.status_code == 200
    mock_redis.get.assert_awaited_once_with(f"refresh:{payload['jti']}")
    cache_call = mock_redis.setex.await_args.args
    assert cache_call[0] == f"refresh:{payload['jti']}"
    assert cache_call[1] > 0
    assert cache_call[2] == str(user.id)


async def test_access_token_authenticates_current_user(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    user = User(email="me@example.com", name="Current User")
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)

    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tokens.access_token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"
    assert response.json()["avatar_url"] is None


async def test_authenticated_user_can_update_profile(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    """Profile updates persist user-owned fields without changing identity."""
    user = User(email="profile@example.com", name="Before")
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)

    response = await client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tokens.access_token}"},
        json={
            "name": "  Updated Person  ",
            "avatar_url": "https://images.example.com/avatar.png",
        },
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated Person"
    assert response.json()["avatar_url"] == "https://images.example.com/avatar.png"
    await db.refresh(user)
    assert user.name == "Updated Person"
    assert user.avatar_url == "https://images.example.com/avatar.png"


async def test_authenticated_user_can_remove_profile_avatar(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    """A null avatar explicitly removes the current profile image."""
    user = User(
        email="remove-avatar@example.com",
        name="Avatar Owner",
        avatar_url="https://images.example.com/avatar.png",
    )
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)

    response = await client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tokens.access_token}"},
        json={"avatar_url": None},
    )

    assert response.status_code == 200
    assert response.json()["avatar_url"] is None


async def test_profile_update_rejects_invalid_or_empty_changes(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    """Profile validation rejects unsafe URLs, blank names, and empty patches."""
    user = User(email="invalid-profile@example.com", name="Profile Owner")
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)
    headers = {"Authorization": f"Bearer {tokens.access_token}"}

    invalid_url = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"avatar_url": "javascript:alert(1)"},
    )
    blank_name = await client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"name": "   "},
    )
    empty_patch = await client.patch("/api/v1/auth/me", headers=headers, json={})

    assert invalid_url.status_code == 422
    assert blank_name.status_code == 422
    assert empty_patch.status_code == 422


async def test_authenticated_user_can_list_and_disconnect_oauth_connections(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    """Connection management is scoped to the access-token user."""
    user = User(email="connections@example.com", name="Connection Owner")
    other_user = User(email="other-connections@example.com", name="Other Owner")
    db.add_all([user, other_user])
    await db.flush()
    db.add_all(
        [
            OAuthAccount(
                user_id=user.id,
                provider="github",
                provider_account_id="github-owner",
                provider_email="owner@github.example",
                provider_name="Connection Owner",
                provider_username="connection-owner",
                avatar_url="https://avatars.example/connection-owner",
            ),
            OAuthAccount(
                user_id=other_user.id,
                provider="github",
                provider_account_id="github-other",
                provider_email="other@github.example",
                provider_username="other-owner",
            ),
        ]
    )
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)
    headers = {"Authorization": f"Bearer {tokens.access_token}"}

    list_response = await client.get("/api/v1/auth/me/connections", headers=headers)

    assert list_response.status_code == 200
    assert list_response.json() == [
        {
            "provider": "github",
            "provider_email": "owner@github.example",
            "provider_name": "Connection Owner",
            "provider_username": "connection-owner",
            "avatar_url": "https://avatars.example/connection-owner",
            "created_at": list_response.json()[0]["created_at"],
        }
    ]

    delete_response = await client.delete(
        "/api/v1/auth/me/connections/github",
        headers=headers,
    )

    assert delete_response.status_code == 204
    remaining = (await db.execute(select(OAuthAccount))).scalars().all()
    assert len(remaining) == 1
    assert remaining[0].user_id == other_user.id


async def test_disconnecting_missing_oauth_connection_returns_not_found(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    """A missing provider produces a stable not-found response."""
    user = User(email="missing-connection@example.com", name="Missing Connection")
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)

    response = await client.delete(
        "/api/v1/auth/me/connections/github",
        headers={"Authorization": f"Bearer {tokens.access_token}"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "No github account is connected"


async def test_refresh_token_cannot_authenticate_current_user(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    user = User(email="wrong-type@example.com", name="Wrong Token Type")
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)

    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {tokens.refresh_token}"},
    )

    assert response.status_code == 401


async def test_logout_revokes_refresh_token_in_redis_and_database(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    user = User(email="logout@example.com", name="Logout User")
    db.add(user)
    await db.commit()
    tokens = await create_user_tokens(user, db, mock_redis)
    payload = decode_token(tokens.refresh_token, expected_type="refresh")
    cache_key = f"refresh:{payload['jti']}"
    mock_redis.reset_mock()

    response = await client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": tokens.refresh_token},
    )

    assert response.status_code == 204
    mock_redis.delete.assert_awaited_once_with(cache_key)
    stored_token = (
        await db.execute(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    ).scalar_one()
    assert stored_token.revoked_at is not None

    mock_redis.get.return_value = None
    refresh_response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens.refresh_token},
    )
    assert refresh_response.status_code == 401
