"""GitHub-only OAuth authentication tests."""

import json
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

from httpx import AsyncClient
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.oauth_account import OAuthAccount
from app.modules.identity.models.user import User
from app.modules.identity.routes import github as github_oauth
from app.modules.identity.service import oauth_code_cache_key
from app.modules.identity.tokens import create_access_token
from app.modules.tenancy.models.organization import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from app.modules.tenancy.models.project import Project


async def test_github_login_redirects_with_server_stored_state(
    client: AsyncClient,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")

    response = await client.get("/api/v1/oauth/github/login", follow_redirects=False)

    assert response.status_code == 307
    redirect = urlparse(response.headers["location"])
    query = parse_qs(redirect.query)
    assert f"{redirect.scheme}://{redirect.netloc}{redirect.path}" == (
        "https://github.com/login/oauth/authorize"
    )
    assert query["client_id"] == ["github-client"]
    assert query["scope"] == ["read:user user:email"]
    assert len(query["state"][0]) >= 32
    mock_redis.setex.assert_awaited_once_with(
        f"oauth:state:{query['state'][0]}",
        settings.OAUTH_STATE_TTL_SECONDS,
        "1",
    )


async def test_github_login_stores_a_safe_return_path_in_state(
    client: AsyncClient,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")

    response = await client.get(
        "/api/v1/oauth/github/login?next=/invitations/accept%3Ftoken%3Dabc",
        follow_redirects=False,
    )

    assert response.status_code == 307
    stored = mock_redis.setex.await_args.args[2]
    assert json.loads(stored) == {"next": "/invitations/accept?token=abc"}


async def test_github_login_drops_an_open_redirect_return_path(
    client: AsyncClient,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")

    response = await client.get(
        "/api/v1/oauth/github/login?next=https://evil.example.com",
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert mock_redis.setex.await_args.args[2] == "1"


async def test_github_callback_forwards_a_return_path_from_state(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")
    mock_redis.getdel.return_value = json.dumps({"next": "/invitations/accept?token=abc"})
    monkeypatch.setattr(
        github_oauth.github_provider,
        "exchange_identity",
        AsyncMock(
            return_value={
                "id": "9001",
                "login": "returner",
                "name": "Ret Urner",
                "email": "returner@github.example",
                "avatar_url": "https://avatars.example/returner",
            }
        ),
        raising=False,
    )

    response = await client.get(
        "/api/v1/oauth/github/callback?code=oauth-code&state=oauth-state",
        follow_redirects=False,
    )

    assert response.status_code == 307
    redirect = urlparse(response.headers["location"])
    query = parse_qs(redirect.query)
    assert query["next"] == ["/invitations/accept?token=abc"]
    assert query["code"][0]


async def test_github_callback_registers_user_and_default_tenant(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")
    mock_redis.getdel.return_value = "1"
    monkeypatch.setattr(
        github_oauth.github_provider,
        "exchange_identity",
        AsyncMock(
            return_value={
                "id": "12345",
                "login": "octocat",
                "name": "The Octocat",
                "email": "octocat@github.example",
                "avatar_url": "https://avatars.example/octocat",
            }
        ),
        raising=False,
    )

    response = await client.get(
        "/api/v1/oauth/github/callback?code=oauth-code&state=oauth-state",
        follow_redirects=False,
    )

    assert response.status_code == 307
    redirect = urlparse(response.headers["location"])
    authorization_code = parse_qs(redirect.query)["code"][0]
    assert f"{redirect.scheme}://{redirect.netloc}{redirect.path}" == (
        "http://localhost:3000/auth/callback"
    )

    user = (
        await db.execute(select(User).where(User.email == "octocat@github.example"))
    ).scalar_one()
    oauth_account = (
        await db.execute(select(OAuthAccount).where(OAuthAccount.user_id == user.id))
    ).scalar_one()
    email_address = (
        await db.execute(select(EmailAddress).where(EmailAddress.user_id == user.id))
    ).scalar_one()
    assert oauth_account.provider == "github"
    assert oauth_account.provider_account_id == "12345"
    assert oauth_account.provider_email == "octocat@github.example"
    assert user.avatar_url == "https://avatars.example/octocat"
    assert email_address.email == "octocat@github.example"
    assert email_address.is_primary is True
    assert email_address.verified_at is not None
    organization = (
        await db.execute(select(Organization).where(Organization.created_by_user_id == user.id))
    ).scalar_one()
    membership = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization.id,
                OrganizationMembership.user_id == user.id,
            )
        )
    ).scalar_one()
    project = (
        await db.execute(select(Project).where(Project.organization_id == organization.id))
    ).scalar_one()
    assert membership.role == OrganizationRole.OWNER
    assert project.slug == "default"

    mock_redis.setex.assert_awaited_once_with(
        oauth_code_cache_key(authorization_code),
        settings.OAUTH_CODE_TTL_SECONDS,
        str(user.id),
    )
    mock_redis.getdel.return_value = str(user.id)
    exchange_response = await client.post(
        "/api/v1/auth/oauth/exchange",
        json={"code": authorization_code},
    )
    assert exchange_response.status_code == 200
    tokens = exchange_response.json()
    refresh_payload = jwt.decode(
        tokens["refresh_token"],
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
    )
    mock_redis.getdel.assert_any_await("oauth:state:oauth-state")
    mock_redis.getdel.assert_any_await(oauth_code_cache_key(authorization_code))
    mock_redis.setex.assert_any_await(
        f"refresh:{refresh_payload['jti']}",
        int(settings.refresh_token_expire.total_seconds()),
        str(user.id),
    )


async def test_oauth_authorization_code_is_single_use(
    client: AsyncClient,
    mock_redis: AsyncMock,
) -> None:
    mock_redis.getdel.return_value = None

    response = await client.post(
        "/api/v1/auth/oauth/exchange",
        json={"code": "expired-or-reused"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["message"] == "Invalid or expired OAuth authorization code"
    mock_redis.getdel.assert_awaited_once_with(oauth_code_cache_key("expired-or-reused"))


async def test_github_callback_rejects_unknown_or_reused_state(
    client: AsyncClient,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")
    mock_redis.getdel.return_value = None

    response = await client.get(
        "/api/v1/oauth/github/callback?code=oauth-code&state=invalid-state",
        follow_redirects=False,
    )

    assert response.status_code == 400
    assert "Invalid or expired OAuth state" in str(response.json())
    mock_redis.getdel.assert_awaited_once_with("oauth:state:invalid-state")


async def test_repeat_github_login_reuses_user_and_workspace(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")
    mock_redis.getdel.return_value = "1"
    identity = {
        "id": "same-account",
        "login": "repeat-user",
        "name": "Repeat User",
        "email": "repeat@github.example",
        "avatar_url": None,
    }
    monkeypatch.setattr(
        github_oauth.github_provider,
        "exchange_identity",
        AsyncMock(return_value=identity),
    )

    first_response = await client.get(
        "/api/v1/oauth/github/callback?code=first&state=first-state",
        follow_redirects=False,
    )
    second_response = await client.get(
        "/api/v1/oauth/github/callback?code=second&state=second-state",
        follow_redirects=False,
    )

    assert first_response.status_code == 307
    assert second_response.status_code == 307
    assert len((await db.execute(select(User))).scalars().all()) == 1
    assert len((await db.execute(select(OAuthAccount))).scalars().all()) == 1
    assert len((await db.execute(select(EmailAddress))).scalars().all()) == 1
    assert len((await db.execute(select(Organization))).scalars().all()) == 1
    assert len((await db.execute(select(Project))).scalars().all()) == 1


async def test_existing_github_login_adds_changed_email_without_removing_old_magic_login(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")
    user = User(
        email="old@example.com",
        name="Existing User",
        avatar_url="https://images.example.com/custom-avatar.png",
    )
    db.add(user)
    await db.flush()
    db.add_all(
        [
            EmailAddress(
                user_id=user.id,
                email="old@example.com",
                is_primary=True,
                verified_at=utc_now(),
            ),
            OAuthAccount(
                user_id=user.id,
                provider="github",
                provider_account_id="existing-github-id",
                provider_email="old@example.com",
                provider_username="existing-user",
            ),
        ]
    )
    await db.commit()
    mock_redis.getdel.return_value = "1"
    monkeypatch.setattr(
        github_oauth.github_provider,
        "exchange_identity",
        AsyncMock(
            return_value={
                "id": "existing-github-id",
                "login": "existing-user",
                "name": "Existing User",
                "email": "new@example.com",
                "avatar_url": "https://avatars.example/provider-refresh",
            }
        ),
    )

    oauth_response = await client.get(
        "/api/v1/oauth/github/callback?code=login-code&state=login-state",
        follow_redirects=False,
    )

    assert oauth_response.status_code == 307
    emails = (await db.execute(select(EmailAddress))).scalars().all()
    assert {(email.email, email.is_primary) for email in emails} == {
        ("old@example.com", True),
        ("new@example.com", False),
    }
    account = (await db.execute(select(OAuthAccount))).scalar_one()
    assert account.provider_email == "new@example.com"
    await db.refresh(user)
    assert user.avatar_url == "https://images.example.com/custom-avatar.png"

    mock_redis.getdel.return_value = json.dumps({"email": "old@example.com"})
    magic_response = await client.post(
        "/api/v1/auth/magic-link/verify",
        json={"token": "old-email-magic-link"},
    )
    assert magic_response.status_code == 200
    access_payload = jwt.decode(
        magic_response.json()["access_token"],
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
    )
    assert access_payload["sub"] == str(user.id)


async def test_signed_in_user_can_connect_github_and_add_its_verified_email(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")
    user = User(email="magic@example.com", name="Magic User")
    db.add(user)
    await db.flush()
    db.add(
        EmailAddress(
            user_id=user.id,
            email="magic@example.com",
            is_primary=True,
            verified_at=utc_now(),
        )
    )
    await db.commit()

    connect_response = await client.get(
        "/api/v1/oauth/github/connect",
        headers={"Authorization": f"Bearer {create_access_token(user.id)}"},
        follow_redirects=False,
    )

    assert connect_response.status_code == 307
    state = parse_qs(urlparse(connect_response.headers["location"]).query)["state"][0]
    stored_state = mock_redis.setex.await_args.args[2]
    mock_redis.getdel.return_value = stored_state
    monkeypatch.setattr(
        github_oauth.github_provider,
        "exchange_identity",
        AsyncMock(
            return_value={
                "id": "connected-github-id",
                "login": "connected-user",
                "name": "Connected User",
                "email": "github-secondary@example.com",
                "avatar_url": "https://avatars.example/connected-user",
            }
        ),
    )

    callback_response = await client.get(
        f"/api/v1/oauth/github/callback?code=connect-code&state={state}",
        follow_redirects=False,
    )

    assert callback_response.status_code == 307
    account = (await db.execute(select(OAuthAccount))).scalar_one()
    assert account.user_id == user.id
    assert account.provider == "github"
    await db.refresh(user)
    assert user.avatar_url == "https://avatars.example/connected-user"
    emails = (await db.execute(select(EmailAddress))).scalars().all()
    assert {email.email for email in emails} == {
        "magic@example.com",
        "github-secondary@example.com",
    }


async def test_github_email_collision_requires_sign_in_then_connect(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")
    user = User(email="owned@example.com", name="Existing Owner")
    db.add(user)
    await db.flush()
    db.add(
        EmailAddress(
            user_id=user.id,
            email="owned@example.com",
            is_primary=True,
            verified_at=utc_now(),
        )
    )
    await db.commit()
    mock_redis.getdel.return_value = "1"
    monkeypatch.setattr(
        github_oauth.github_provider,
        "exchange_identity",
        AsyncMock(
            return_value={
                "id": "unconnected-github-id",
                "login": "existing-owner",
                "name": "Existing Owner",
                "email": "owned@example.com",
                "avatar_url": None,
            }
        ),
    )

    response = await client.get(
        "/api/v1/oauth/github/callback?code=login-code&state=login-state",
        follow_redirects=False,
    )

    assert response.status_code == 409
    assert "sign in and connect" in str(response.json()).lower()
    assert len((await db.execute(select(User))).scalars().all()) == 1
    assert len((await db.execute(select(OAuthAccount))).scalars().all()) == 0


async def test_existing_oauth_login_records_email_owned_by_another_user(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "github-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "github-secret")
    oauth_user = User(email="oauth-owner@example.com", name="OAuth Owner")
    email_user = User(email="shared@example.com", name="Email Owner")
    db.add_all([oauth_user, email_user])
    await db.flush()
    db.add_all(
        [
            EmailAddress(
                user_id=oauth_user.id,
                email="oauth-owner@example.com",
                is_primary=True,
                verified_at=utc_now(),
            ),
            EmailAddress(
                user_id=email_user.id,
                email="shared@example.com",
                is_primary=True,
                verified_at=utc_now(),
            ),
            OAuthAccount(
                user_id=oauth_user.id,
                provider="github",
                provider_account_id="oauth-owner-github-id",
                provider_email="oauth-owner@example.com",
            ),
        ]
    )
    await db.commit()
    mock_redis.getdel.return_value = "1"
    monkeypatch.setattr(
        github_oauth.github_provider,
        "exchange_identity",
        AsyncMock(
            return_value={
                "id": "oauth-owner-github-id",
                "login": "oauth-owner",
                "name": "OAuth Owner",
                "email": "shared@example.com",
                "avatar_url": None,
            }
        ),
    )

    response = await client.get(
        "/api/v1/oauth/github/callback?code=login-code&state=login-state",
        follow_redirects=False,
    )

    assert response.status_code == 307
    account = (await db.execute(select(OAuthAccount))).scalar_one()
    assert account.provider_email == "shared@example.com"
    assert account.email_conflict_at is not None
    shared_email = (
        await db.execute(select(EmailAddress).where(EmailAddress.email == "shared@example.com"))
    ).scalar_one()
    assert shared_email.user_id == email_user.id
