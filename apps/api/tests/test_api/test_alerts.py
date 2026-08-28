"""Alert endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_alert_rule_crud(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post(
        "/api/v1/alerts",
        json={
            "name": "High failure rate",
            "metric": "failure_rate",
            "threshold": 0.2,
            "window_minutes": 60,
            "notify_email": "ops@example.com",
        },
    )
    assert create_resp.status_code == 201
    rule_id = create_resp.json()["id"]

    list_resp = await auth_client.get("/api/v1/alerts")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    update_resp = await auth_client.put(
        f"/api/v1/alerts/{rule_id}",
        json={"threshold": 0.3, "is_active": False},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["threshold"] == 0.3
    assert update_resp.json()["is_active"] is False

    delete_resp = await auth_client.delete(f"/api/v1/alerts/{rule_id}")
    assert delete_resp.status_code == 204
