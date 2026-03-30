"""Template endpoint tests."""

import pytest
from httpx import AsyncClient

from app.models.api_key import ApiKey


def _template_payload(**overrides):
    base = {
        "name": "test_template",
        "channel": "email",
        "subject": "Hello {{ name }}",
        "body": "<p>Hi {{ name }}, welcome!</p>",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_template(auth_client: AsyncClient, api_key_pair: tuple[ApiKey, str]) -> None:
    resp = await auth_client.post("/api/v1/templates", json=_template_payload())
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test_template"
    assert data["channel"] == "email"
    assert data["is_active"] is True
    assert data["created_by"] == str(api_key_pair[0].id)


@pytest.mark.asyncio
async def test_list_templates(auth_client: AsyncClient) -> None:
    await auth_client.post("/api/v1/templates", json=_template_payload(name="list_t1"))
    await auth_client.post("/api/v1/templates", json=_template_payload(name="list_t2"))

    resp = await auth_client.get("/api/v1/templates")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    assert len(data["items"]) >= 2


@pytest.mark.asyncio
async def test_get_template(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post("/api/v1/templates", json=_template_payload(name="get_t"))
    tid = create_resp.json()["id"]

    resp = await auth_client.get(f"/api/v1/templates/{tid}")
    assert resp.status_code == 200
    assert resp.json()["id"] == tid


@pytest.mark.asyncio
async def test_update_template(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post("/api/v1/templates", json=_template_payload(name="upd_t"))
    tid = create_resp.json()["id"]

    resp = await auth_client.put(
        f"/api/v1/templates/{tid}",
        json={"body": "<p>Updated body</p>"},
    )
    assert resp.status_code == 200
    assert resp.json()["body"] == "<p>Updated body</p>"


@pytest.mark.asyncio
async def test_delete_template(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post("/api/v1/templates", json=_template_payload(name="del_t"))
    tid = create_resp.json()["id"]

    resp = await auth_client.delete(f"/api/v1/templates/{tid}")
    assert resp.status_code == 204

    resp = await auth_client.get(f"/api/v1/templates/{tid}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_template_preview(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post(
        "/api/v1/templates", json=_template_payload(name="preview_t")
    )
    tid = create_resp.json()["id"]

    resp = await auth_client.post(
        f"/api/v1/templates/{tid}/preview",
        json={"template_id": tid, "variables": {"name": "Alice"}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "Alice" in data["body"]
    assert "Alice" in data["subject"]


@pytest.mark.asyncio
async def test_get_nonexistent_template(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/v1/templates/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
