"""Admin endpoint tests."""

import pytest
from httpx import AsyncClient

MASTER_KEY = "test-master-key-secret"


@pytest.fixture
async def master_client(monkeypatch, client: AsyncClient) -> AsyncClient:
    from app.core.config import settings

    monkeypatch.setattr(settings, "MASTER_API_KEY", MASTER_KEY)
    client.headers["X-API-Key"] = MASTER_KEY
    return client


@pytest.mark.asyncio
async def test_admin_endpoints(master_client: AsyncClient) -> None:
    keys_resp = await master_client.get("/api/v1/admin/keys")
    assert keys_resp.status_code == 200

    health_resp = await master_client.get("/api/v1/admin/health")
    assert health_resp.status_code == 200
    assert "database" in health_resp.json()

    analytics_resp = await master_client.get("/api/v1/admin/analytics")
    assert analytics_resp.status_code == 200
    assert "total_events" in analytics_resp.json()

    audit_resp = await master_client.get("/api/v1/admin/audit-log")
    assert audit_resp.status_code == 200

    usage_resp = await master_client.get("/api/v1/admin/usage")
    assert usage_resp.status_code == 200


@pytest.mark.asyncio
async def test_admin_template_crud(master_client: AsyncClient) -> None:
    create_resp = await master_client.post(
        "/api/v1/admin/templates",
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

    list_resp = await master_client.get("/api/v1/admin/templates")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 1

    update_resp = await master_client.put(
        f"/api/v1/admin/templates/{template_id}",
        json={"body": "Hi {{name}}"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["body"] == "Hi {{name}}"

    delete_resp = await master_client.delete(f"/api/v1/admin/templates/{template_id}")
    assert delete_resp.status_code == 204


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/admin/keys",
        "/api/v1/admin/health",
        "/api/v1/admin/analytics",
        "/api/v1/admin/audit-log",
        "/api/v1/admin/templates",
        "/api/v1/admin/usage",
    ],
)
async def test_admin_routes_reject_regular_key(auth_client: AsyncClient, path: str) -> None:
    """Regular API key must be rejected (401) on all admin routes."""
    response = await auth_client.get(path)
    assert response.status_code == 401
