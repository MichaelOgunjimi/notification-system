"""Usage endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_usage_records_requests(auth_client: AsyncClient) -> None:
    health_resp = await auth_client.get("/api/v1/health")
    assert health_resp.status_code == 200

    usage_resp = await auth_client.get("/api/v1/usage")
    assert usage_resp.status_code == 200
    data = usage_resp.json()
    assert data["total"] >= 1
    assert any(item["endpoint"] == "/api/v1/health" for item in data["items"])


@pytest.mark.asyncio
async def test_analytics_and_trends_scope_to_the_calling_key(auth_client: AsyncClient) -> None:
    analytics_resp = await auth_client.get("/api/v1/analytics")
    assert analytics_resp.status_code == 200
    assert "channel_stats" in analytics_resp.json()

    trends_resp = await auth_client.get("/api/v1/analytics/trends")
    assert trends_resp.status_code == 200
    assert "points" in trends_resp.json()
