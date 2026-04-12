"""Rate limit middleware tests."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis

from app.core.config import settings
from app.core.redis import get_redis


def _event_payload() -> dict:
    return {
        "event_type": "rate-limit.test",
        "recipients": [
            {
                "user_id": "user-1",
                "channels": ["email"],
                "email": "test@example.com",
            }
        ],
        "priority": "high",
        "payload": {"hello": "world"},
    }


async def _flush_rate_limit_keys(redis: Redis) -> None:
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor=cursor, match="rl:*", count=1000)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break


@pytest_asyncio.fixture
async def redis_client() -> Redis:
    redis = get_redis()
    try:
        await redis.ping()
    except Exception as exc:
        pytest.skip(f"Redis unavailable for rate-limit tests: {exc}")
    return redis


@pytest_asyncio.fixture(autouse=True)
async def _clear_rate_limit_state(redis_client: Redis):
    await _flush_rate_limit_keys(redis_client)
    yield
    await _flush_rate_limit_keys(redis_client)


@pytest.mark.asyncio
async def test_rate_limit_regular_key_general(auth_client: AsyncClient) -> None:
    responses = [await auth_client.get("/api/v1/templates") for _ in range(101)]
    assert all(resp.status_code == 200 for resp in responses[:100])
    assert responses[100].status_code == 429


@pytest.mark.asyncio
async def test_rate_limit_events_endpoint(auth_client: AsyncClient) -> None:
    responses = [await auth_client.post("/api/v1/events", json=_event_payload()) for _ in range(31)]
    assert all(resp.status_code == 202 for resp in responses[:30])
    assert responses[30].status_code == 429


@pytest.mark.asyncio
async def test_master_key_exempt(monkeypatch, client: AsyncClient) -> None:
    monkeypatch.setattr(settings, "MASTER_API_KEY", "test-master-rate-limit-key")
    client.headers["X-API-Key"] = "test-master-rate-limit-key"
    responses = [await client.get("/api/v1/settings/api-keys") for _ in range(150)]
    assert all(resp.status_code == 200 for resp in responses)


@pytest.mark.asyncio
async def test_rate_limit_headers_present(auth_client: AsyncClient) -> None:
    response = await auth_client.get("/api/v1/templates")
    assert response.status_code == 200
    assert "X-RateLimit-Limit" in response.headers
    assert "X-RateLimit-Remaining" in response.headers
    assert "X-RateLimit-Reset" in response.headers


@pytest.mark.asyncio
async def test_rate_limit_429_body(monkeypatch, auth_client: AsyncClient) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_DEFAULT", 1)

    first = await auth_client.get("/api/v1/templates")
    assert first.status_code == 200

    limited = await auth_client.get("/api/v1/templates")
    assert limited.status_code == 429
    payload = limited.json()
    assert payload["detail"].startswith("Rate limit exceeded. Try again in ")
    assert isinstance(payload["retry_after"], int)
    assert payload["retry_after"] >= 0
    assert limited.headers["Retry-After"] == str(payload["retry_after"])


@pytest.mark.asyncio
async def test_rate_limit_disabled(monkeypatch, auth_client: AsyncClient) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)
    responses = [await auth_client.get("/api/v1/templates") for _ in range(150)]
    assert all(resp.status_code == 200 for resp in responses)
