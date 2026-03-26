"""Auth / API-key tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_missing_api_key_returns_401(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/events/00000000-0000-0000-0000-000000000000")
    assert resp.status_code in (401, 422)


@pytest.mark.asyncio
async def test_invalid_api_key_returns_401(client: AsyncClient) -> None:
    resp = await client.get(
        "/api/v1/events/00000000-0000-0000-0000-000000000000",
        headers={"X-API-Key": "nk_totallyinvalidkey"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_valid_api_key_passes(auth_client: AsyncClient) -> None:
    resp = await auth_client.get("/api/v1/templates")
    assert resp.status_code == 200
