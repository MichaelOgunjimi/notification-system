"""Project-scoped settings endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_projectless_api_key_routes_are_removed(client: AsyncClient) -> None:
    responses = [
        await client.get("/api/v1/settings/api-keys"),
        await client.post("/api/v1/settings/api-keys", json={"name": "legacy"}),
        await client.delete("/api/v1/settings/api-keys/00000000-0000-0000-0000-000000000000"),
    ]

    assert all(response.status_code == 404 for response in responses)


@pytest.mark.asyncio
async def test_channel_settings_remain_available_to_project_keys(
    auth_client: AsyncClient,
) -> None:
    response = await auth_client.get("/api/v1/settings/channels")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_retry_settings_remain_available_to_project_keys(
    auth_client: AsyncClient,
) -> None:
    response = await auth_client.get("/api/v1/settings/retry-policies")

    assert response.status_code == 200
    assert isinstance(response.json(), list)
