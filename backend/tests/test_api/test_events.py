"""Event endpoint tests."""

import pytest
from httpx import AsyncClient


def _event_payload(**overrides):
    base = {
        "event_type": "user.signup",
        "recipients": [
            {
                "user_id": "user-1",
                "channels": ["email"],
                "email": "test@example.com",
            }
        ],
        "priority": "high",
        "payload": {"welcome": True},
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_event(auth_client: AsyncClient) -> None:
    resp = await auth_client.post("/api/v1/events", json=_event_payload())
    assert resp.status_code == 201
    data = resp.json()
    assert data["event_type"] == "user.signup"
    assert data["priority"] == "high"
    assert data["status"] == "accepted"
    assert len(data["notification_ids"]) == 1


@pytest.mark.asyncio
async def test_get_event(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post("/api/v1/events", json=_event_payload())
    event_id = create_resp.json()["id"]

    resp = await auth_client.get(f"/api/v1/events/{event_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == event_id


@pytest.mark.asyncio
async def test_batch_events(auth_client: AsyncClient) -> None:
    payload = {
        "events": [
            _event_payload(event_type="batch.one"),
            _event_payload(event_type="batch.two"),
        ]
    }
    resp = await auth_client.post("/api/v1/events/batch", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert len(data) == 2
    assert data[0]["event_type"] == "batch.one"
    assert data[1]["event_type"] == "batch.two"


@pytest.mark.asyncio
async def test_create_event_missing_fields(auth_client: AsyncClient) -> None:
    resp = await auth_client.post("/api/v1/events", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_event_no_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/events", json=_event_payload())
    assert resp.status_code in (401, 422)
