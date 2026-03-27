"""Data isolation tests — verify API key A cannot access API key B's data."""

import pytest
from httpx import AsyncClient


def _event_payload(**overrides):
    base = {
        "event_type": "isolation.test",
        "recipients": [
            {
                "user_id": "u1",
                "channels": ["email"],
                "email": "iso@example.com",
            }
        ],
        "priority": "medium",
        "payload": {"test": True},
    }
    base.update(overrides)
    return base


def _template_payload(**overrides):
    base = {
        "name": "iso_template",
        "channel": "email",
        "subject": "Hello",
        "body": "<p>Hi</p>",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_event_isolation(
    auth_client: AsyncClient, auth_client_b: AsyncClient
) -> None:
    """Event created by key A is not visible to key B."""
    resp = await auth_client.post("/api/v1/events", json=_event_payload())
    assert resp.status_code == 201
    event_id = resp.json()["id"]

    # Key A can read its own event
    resp_a = await auth_client.get(f"/api/v1/events/{event_id}")
    assert resp_a.status_code == 200

    # Key B cannot read key A's event
    resp_b = await auth_client_b.get(f"/api/v1/events/{event_id}")
    assert resp_b.status_code == 404


@pytest.mark.asyncio
async def test_notification_isolation(
    auth_client: AsyncClient, auth_client_b: AsyncClient
) -> None:
    """Notification from key A's event is not visible to key B."""
    resp = await auth_client.post("/api/v1/events", json=_event_payload())
    assert resp.status_code == 201
    nid = resp.json()["notification_ids"][0]

    # Key A can read its own notification
    resp_a = await auth_client.get(f"/api/v1/notifications/{nid}")
    assert resp_a.status_code == 200

    # Key B cannot read key A's notification
    resp_b = await auth_client_b.get(f"/api/v1/notifications/{nid}")
    assert resp_b.status_code == 404


@pytest.mark.asyncio
async def test_notification_list_isolation(
    auth_client: AsyncClient, auth_client_b: AsyncClient
) -> None:
    """Notification list for key B is empty when only key A created events."""
    await auth_client.post("/api/v1/events", json=_event_payload())

    resp_a = await auth_client.get("/api/v1/notifications")
    assert resp_a.status_code == 200
    assert resp_a.json()["total"] >= 1

    resp_b = await auth_client_b.get("/api/v1/notifications")
    assert resp_b.status_code == 200
    assert resp_b.json()["total"] == 0


@pytest.mark.asyncio
async def test_template_isolation(
    auth_client: AsyncClient, auth_client_b: AsyncClient
) -> None:
    """Template created by key A is not visible to key B."""
    resp = await auth_client.post(
        "/api/v1/templates", json=_template_payload(name="iso_get")
    )
    assert resp.status_code == 201
    tid = resp.json()["id"]

    # Key A can read its own template
    resp_a = await auth_client.get(f"/api/v1/templates/{tid}")
    assert resp_a.status_code == 200

    # Key B cannot read key A's template
    resp_b = await auth_client_b.get(f"/api/v1/templates/{tid}")
    assert resp_b.status_code == 404


@pytest.mark.asyncio
async def test_template_list_isolation(
    auth_client: AsyncClient, auth_client_b: AsyncClient
) -> None:
    """Template list for key B is empty when only key A created templates."""
    await auth_client.post(
        "/api/v1/templates", json=_template_payload(name="iso_list")
    )

    resp_a = await auth_client.get("/api/v1/templates")
    assert resp_a.status_code == 200
    assert resp_a.json()["total"] >= 1

    resp_b = await auth_client_b.get("/api/v1/templates")
    assert resp_b.status_code == 200
    assert resp_b.json()["total"] == 0


@pytest.mark.asyncio
async def test_template_update_isolation(
    auth_client: AsyncClient, auth_client_b: AsyncClient
) -> None:
    """Key B cannot update key A's template."""
    resp = await auth_client.post(
        "/api/v1/templates", json=_template_payload(name="iso_upd")
    )
    tid = resp.json()["id"]

    resp_b = await auth_client_b.put(
        f"/api/v1/templates/{tid}", json={"body": "hacked"}
    )
    assert resp_b.status_code == 404


@pytest.mark.asyncio
async def test_template_delete_isolation(
    auth_client: AsyncClient, auth_client_b: AsyncClient
) -> None:
    """Key B cannot delete key A's template."""
    resp = await auth_client.post(
        "/api/v1/templates", json=_template_payload(name="iso_del")
    )
    tid = resp.json()["id"]

    resp_b = await auth_client_b.delete(f"/api/v1/templates/{tid}")
    assert resp_b.status_code == 404

    # Key A can still see the template
    resp_a = await auth_client.get(f"/api/v1/templates/{tid}")
    assert resp_a.status_code == 200
