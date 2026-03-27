"""Event endpoint tests."""

from unittest.mock import AsyncMock, patch

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
async def test_batch_events_share_batch_id(auth_client: AsyncClient) -> None:
    """All events in a batch must share the same batch_id."""
    payload = {
        "events": [
            _event_payload(event_type="batch.a"),
            _event_payload(event_type="batch.b"),
            _event_payload(event_type="batch.c"),
        ]
    }
    resp = await auth_client.post("/api/v1/events/batch", json=payload)
    assert resp.status_code == 201
    data = resp.json()

    # Fetch detail for each event and verify shared batch_id
    batch_ids = set()
    for event in data:
        detail = await auth_client.get(f"/api/v1/events/{event['id']}")
        assert detail.status_code == 200
        batch_ids.add(detail.json()["batch_id"])

    assert len(batch_ids) == 1
    assert batch_ids.pop() is not None


@pytest.mark.asyncio
async def test_batch_atomicity_rolls_back_on_failure(auth_client: AsyncClient) -> None:
    """If any event in a batch fails, all preceding events are rolled back."""
    payload = {
        "events": [
            _event_payload(event_type="atomic.ok"),
            _event_payload(event_type="atomic.ok2"),
        ]
    }

    original = (await import_event_service()).create_event

    call_count = 0

    async def _fail_on_second(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count >= 2:
            raise RuntimeError("simulated failure")
        return await original(*args, **kwargs)

    with patch("app.api.v1.events.event_service.create_event", side_effect=_fail_on_second):
        resp = await auth_client.post("/api/v1/events/batch", json=payload)

    assert resp.status_code == 500
    assert "rolled back" in resp.json()["detail"].lower()


async def import_event_service():
    from app.services import event_service
    return event_service


@pytest.mark.asyncio
async def test_create_event_missing_email(auth_client: AsyncClient) -> None:
    """Requesting email channel without an email address returns 422."""
    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(recipients=[{"user_id": "u1", "channels": ["email"]}]),
    )
    assert resp.status_code == 422
    assert "email" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_event_missing_phone(auth_client: AsyncClient) -> None:
    """Requesting sms channel without a phone number returns 422."""
    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(recipients=[{"user_id": "u1", "channels": ["sms"]}]),
    )
    assert resp.status_code == 422
    assert "phone" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_event_missing_webhook_url(auth_client: AsyncClient) -> None:
    """Requesting webhook channel without a webhook_url returns 422."""
    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(recipients=[{"user_id": "u1", "channels": ["webhook"]}]),
    )
    assert resp.status_code == 422
    assert "webhook_url" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_batch_missing_contact_returns_422(auth_client: AsyncClient) -> None:
    """Batch with missing contact info returns 422 and rolls back."""
    payload = {
        "events": [
            _event_payload(event_type="ok.event"),
            _event_payload(
                event_type="bad.event",
                recipients=[{"user_id": "u1", "channels": ["email"]}],
            ),
        ]
    }
    resp = await auth_client.post("/api/v1/events/batch", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_event_missing_fields(auth_client: AsyncClient) -> None:
    resp = await auth_client.post("/api/v1/events", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_event_no_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/events", json=_event_payload())
    assert resp.status_code in (401, 422)
