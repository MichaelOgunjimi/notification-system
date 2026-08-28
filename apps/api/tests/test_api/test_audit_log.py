"""Audit log endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_audit_log_lists_key_actions(auth_client: AsyncClient) -> None:
    event_resp = await auth_client.post(
        "/api/v1/events",
        json={
            "event_type": "user.signup",
            "recipients": [
                {"user_id": "u1", "channels": ["email"], "email": "user@example.com"},
            ],
            "payload": {"name": "User"},
        },
    )
    assert event_resp.status_code == 202

    resp = await auth_client.get("/api/v1/audit-log?action=event.created")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert data["items"][0]["action"] == "event.created"
