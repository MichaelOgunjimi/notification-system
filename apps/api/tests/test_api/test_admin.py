"""Scoped platform administration endpoint tests."""

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.types import AdminRole
from app.modules.admin.users.model import AdminUser
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens


async def _admin_headers(
    db: AsyncSession,
    redis: AsyncMock,
    *,
    role: AdminRole = AdminRole.SUPER_ADMIN,
) -> tuple[dict[str, str], User, AdminUser]:
    user = User(email=f"{role.value}@example.com", name="Platform Admin")
    db.add(user)
    await db.flush()
    db.add(
        EmailAddress(
            user_id=user.id,
            email=user.email,
            is_primary=True,
            verified_at=user.created_at,
        )
    )
    admin = AdminUser(user_id=user.id, role=role)
    db.add(admin)
    await db.commit()
    tokens = await create_user_tokens(user, db, redis)
    return {"Authorization": f"Bearer {tokens.access_token}"}, user, admin


@pytest.mark.asyncio
async def test_admin_endpoints(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    headers, _, _ = await _admin_headers(db, mock_redis)
    keys_resp = await client.get("/api/v1/admin/keys", headers=headers)
    assert keys_resp.status_code == 200

    health_resp = await client.get("/api/v1/admin/health", headers=headers)
    assert health_resp.status_code == 200
    assert "database" in health_resp.json()

    analytics_resp = await client.get("/api/v1/admin/analytics", headers=headers)
    assert analytics_resp.status_code == 200
    assert "total_events" in analytics_resp.json()

    audit_resp = await client.get("/api/v1/admin/audit-log", headers=headers)
    assert audit_resp.status_code == 200

    usage_resp = await client.get("/api/v1/admin/usage", headers=headers)
    assert usage_resp.status_code == 200


@pytest.mark.asyncio
async def test_admin_template_crud(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    headers, _, _ = await _admin_headers(db, mock_redis)
    create_resp = await client.post(
        "/api/v1/admin/templates",
        headers=headers,
        json={
            "name": "welcome_default",
            "channel": "email",
            "subject": "Welcome",
            "body": "Hello {{name}}",
            "variables": ["name"],
        },
    )
    assert create_resp.status_code == 201
    template_id = create_resp.json()["id"]
    assert create_resp.json()["api_key_id"] is None

    list_resp = await client.get("/api/v1/admin/templates", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1

    update_resp = await client.put(
        f"/api/v1/admin/templates/{template_id}",
        headers=headers,
        json={"body": "Hi {{name}}"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["body"] == "Hi {{name}}"

    delete_resp = await client.delete(f"/api/v1/admin/templates/{template_id}", headers=headers)
    assert delete_resp.status_code == 204


@pytest.mark.asyncio
async def test_admin_routes_reject_regular_key(auth_client: AsyncClient) -> None:
    response = await auth_client.get("/api/v1/admin/keys")
    assert response.status_code in {401, 403}


@pytest.mark.asyncio
async def test_admin_permissions_are_scoped(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    headers, _, _ = await _admin_headers(db, mock_redis, role=AdminRole.AUDITOR)
    assert (await client.get("/api/v1/admin/analytics", headers=headers)).status_code == 200
    denied = await client.post(
        "/api/v1/admin/system-accounts",
        headers=headers,
        json={"name": "Dispatcher", "slug": "dispatcher"},
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_system_credential_is_shown_once_and_can_be_revoked(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    headers, _, _ = await _admin_headers(db, mock_redis)
    account = await client.post(
        "/api/v1/admin/system-accounts",
        headers=headers,
        json={"name": "Delivery worker", "slug": "delivery-worker"},
    )
    assert account.status_code == 201
    account_id = account.json()["id"]
    created = await client.post(
        f"/api/v1/admin/system-accounts/{account_id}/credentials",
        headers=headers,
        json={"name": "primary", "permissions": ["system:delivery:process"]},
    )
    assert created.status_code == 201
    assert created.json()["key"].startswith("nsk_")
    credential_id = created.json()["id"]

    listed = await client.get(
        f"/api/v1/admin/system-accounts/{account_id}/credentials",
        headers=headers,
    )
    assert listed.status_code == 200
    assert "key" not in listed.json()[0]

    revoked = await client.delete(
        f"/api/v1/admin/system-accounts/{account_id}/credentials/{credential_id}",
        headers=headers,
    )
    assert revoked.status_code == 204
