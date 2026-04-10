"""Settings endpoint tests — API key CRUD and master-key auth."""

import pytest
from httpx import AsyncClient

MASTER_KEY = "test-master-key-secret"


@pytest.fixture
async def master_client(monkeypatch, client: AsyncClient) -> AsyncClient:
    """Return the unauthenticated client pre-loaded with the master key header.

    monkeypatch sets MASTER_API_KEY on the live settings object so that
    verify_master_key() in deps.py sees the same value without reloading the module.
    """
    from app.core.config import settings

    monkeypatch.setattr(settings, "MASTER_API_KEY", MASTER_KEY)
    client.headers["X-API-Key"] = MASTER_KEY
    return client


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_settings_no_key_returns_503_when_unconfigured(
    monkeypatch, client: AsyncClient
) -> None:
    """Settings endpoints return 503 when MASTER_API_KEY is not configured."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "MASTER_API_KEY", None)
    resp = await client.get("/api/v1/settings/api-keys", headers={"X-API-Key": "any-key"})
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_settings_wrong_master_key_returns_401(monkeypatch, client: AsyncClient) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "MASTER_API_KEY", MASTER_KEY)
    resp = await client.get("/api/v1/settings/api-keys", headers={"X-API-Key": "wrong-key"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Create API key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_api_key(master_client: AsyncClient) -> None:
    resp = await master_client.post("/api/v1/settings/api-keys", json={"name": "ci-key"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "ci-key"
    assert data["key"].startswith("nk_")
    assert data["is_active"] is True
    assert "id" in data
    assert "key_prefix" in data


@pytest.mark.asyncio
async def test_created_key_authenticates(master_client: AsyncClient) -> None:
    """The raw key returned from create must work for regular API requests."""
    create_resp = await master_client.post(
        "/api/v1/settings/api-keys", json={"name": "auth-test-key"}
    )
    assert create_resp.status_code == 201
    raw_key = create_resp.json()["key"]

    # Use raw key to hit a regular endpoint
    resp = await master_client.get("/api/v1/templates", headers={"X-API-Key": raw_key})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# List API keys
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_api_keys_returns_active_keys(master_client: AsyncClient) -> None:
    await master_client.post("/api/v1/settings/api-keys", json={"name": "key-a"})
    await master_client.post("/api/v1/settings/api-keys", json={"name": "key-b"})

    resp = await master_client.get("/api/v1/settings/api-keys")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    names = {item["name"] for item in data["items"]}
    assert names == {"key-a", "key-b"}


@pytest.mark.asyncio
async def test_list_api_keys_does_not_expose_raw_key(master_client: AsyncClient) -> None:
    await master_client.post("/api/v1/settings/api-keys", json={"name": "secret-key"})
    resp = await master_client.get("/api/v1/settings/api-keys")
    assert resp.status_code == 200
    for item in resp.json()["items"]:
        assert "key" not in item or len(item.get("key", "")) == 0


# ---------------------------------------------------------------------------
# Revoke API key
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_revoke_api_key(master_client: AsyncClient) -> None:
    create_resp = await master_client.post("/api/v1/settings/api-keys", json={"name": "to-revoke"})
    key_id = create_resp.json()["id"]

    revoke_resp = await master_client.delete(f"/api/v1/settings/api-keys/{key_id}")
    assert revoke_resp.status_code == 204

    # Revoked key no longer appears in list
    list_resp = await master_client.get("/api/v1/settings/api-keys")
    ids = [item["id"] for item in list_resp.json()["items"]]
    assert key_id not in ids


@pytest.mark.asyncio
async def test_revoked_key_rejected_on_api_requests(master_client: AsyncClient) -> None:
    """Revoking a key must cause subsequent API requests with that key to 401."""
    create_resp = await master_client.post(
        "/api/v1/settings/api-keys", json={"name": "revoke-then-use"}
    )
    data = create_resp.json()
    raw_key = data["key"]
    key_id = data["id"]

    # Key works before revocation
    before = await master_client.get("/api/v1/templates", headers={"X-API-Key": raw_key})
    assert before.status_code == 200

    # Revoke it
    await master_client.delete(f"/api/v1/settings/api-keys/{key_id}")

    # Key no longer works
    after = await master_client.get("/api/v1/templates", headers={"X-API-Key": raw_key})
    assert after.status_code == 401


@pytest.mark.asyncio
async def test_revoke_nonexistent_key_returns_404(master_client: AsyncClient) -> None:
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await master_client.delete(f"/api/v1/settings/api-keys/{fake_id}")
    assert resp.status_code == 404
