"""Suppression endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_suppression_crud(auth_client: AsyncClient) -> None:
    create_resp = await auth_client.post(
        "/api/v1/suppressions",
        json={"channel": "email", "recipient": "blocked@example.com", "reason": "manual"},
    )
    assert create_resp.status_code == 201
    suppression_id = create_resp.json()["id"]

    list_resp = await auth_client.get("/api/v1/suppressions?channel=email")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    delete_resp = await auth_client.delete(f"/api/v1/suppressions/{suppression_id}")
    assert delete_resp.status_code == 204

    list_after = await auth_client.get("/api/v1/suppressions")
    assert list_after.status_code == 200
    assert list_after.json()["total"] == 0
