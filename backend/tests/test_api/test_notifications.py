"""Notification endpoint tests."""

import pytest
from httpx import AsyncClient


def _event_payload(**overrides):
    base = {
        "event_type": "notif.test",
        "recipients": [
            {
                "user_id": "u1",
                "channels": ["email"],
                "email": "notif@example.com",
            }
        ],
        "priority": "medium",
        "payload": {},
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_list_notifications_empty(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/v1/notifications")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 0
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_list_notifications_after_event(auth_client: AsyncClient) -> None:
    await auth_client.post("/api/v1/events", json=_event_payload())

    resp = await auth_client.get("/api/v1/notifications")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert data["items"][0]["channel"] == "email"


@pytest.mark.asyncio
async def test_get_notification_detail(auth_client: AsyncClient) -> None:
    event_resp = await auth_client.post("/api/v1/events", json=_event_payload())
    nid = event_resp.json()["notification_ids"][0]

    resp = await auth_client.get(f"/api/v1/notifications/{nid}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["id"] == nid
    assert "notification_logs" in detail


@pytest.mark.asyncio
async def test_get_nonexistent_notification(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/v1/notifications/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_notifications_require_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/notifications")
    assert resp.status_code in (401, 422)
