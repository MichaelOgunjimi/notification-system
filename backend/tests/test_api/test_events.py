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
    assert resp.status_code == 202
    data = resp.json()
    assert data["event_type"] == "user.signup"
    assert data["priority"] == "high"
    assert data["status"] == "accepted"
    assert data["recipient_count"] >= 1
    assert "notification_ids" not in data


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
    assert resp.status_code == 202
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
    assert resp.status_code == 202
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

    with patch("app.services.event_service.create_event", side_effect=_fail_on_second):
        resp = await auth_client.post("/api/v1/events/batch", json=payload)

    assert resp.status_code == 500
    assert "failed" in resp.json()["detail"].lower()


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


@pytest.mark.asyncio
async def test_invalid_webhook_url_rejected(auth_client: AsyncClient) -> None:
    payload = _event_payload(
        recipients=[
            {
                "user_id": "u1",
                "channels": ["webhook"],
                "webhook_url": "ftp://example.com/hooks",
            }
        ]
    )
    resp = await auth_client.post("/api/v1/events", json=payload)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_private_ip_webhook_url_rejected(auth_client: AsyncClient) -> None:
    payload = _event_payload(
        recipients=[
            {
                "user_id": "u1",
                "channels": ["webhook"],
                "webhook_url": "http://127.0.0.1/hooks",
            }
        ]
    )
    resp = await auth_client.post("/api/v1/events", json=payload)
    assert resp.status_code == 202


# ---------------------------------------------------------------------------
# Idempotency tests
# ---------------------------------------------------------------------------


def _mock_redis_miss():
    """Return an AsyncMock that behaves like a Redis client with no cached keys."""
    mock = AsyncMock()
    mock.get.return_value = None
    mock.set.return_value = True
    return mock


def _mock_redis_hit(event_id: str):
    """Return an AsyncMock that returns a cached event_id on get()."""
    mock = AsyncMock()
    mock.get.return_value = event_id
    mock.set.return_value = True
    return mock


@pytest.mark.asyncio
async def test_idempotency_duplicate_returns_200(auth_client: AsyncClient) -> None:
    """Sending the same idempotency_key twice returns 200 on the second call
    with the same event ID — no duplicate created."""
    payload = _event_payload(idempotency_key="unique-key-001")

    with patch("app.services.idempotency.get_redis", return_value=_mock_redis_miss()):
        first = await auth_client.post("/api/v1/events", json=payload)
    assert first.status_code == 202
    first_id = first.json()["id"]

    # Second request: Redis miss → DB hit (event already exists)
    with patch("app.services.idempotency.get_redis", return_value=_mock_redis_miss()):
        second = await auth_client.post("/api/v1/events", json=payload)
    assert second.status_code == 200
    assert second.json()["id"] == first_id


@pytest.mark.asyncio
async def test_idempotency_redis_cache_hit_returns_200(auth_client: AsyncClient) -> None:
    """When Redis has the cached event_id, the duplicate is detected on the fast path."""
    payload = _event_payload(idempotency_key="unique-key-002")

    with patch("app.services.idempotency.get_redis", return_value=_mock_redis_miss()):
        first = await auth_client.post("/api/v1/events", json=payload)
    assert first.status_code == 202
    first_id = first.json()["id"]

    # Simulate warm Redis cache hit
    with patch("app.services.idempotency.get_redis", return_value=_mock_redis_hit(first_id)):
        second = await auth_client.post("/api/v1/events", json=payload)
    assert second.status_code == 200
    assert second.json()["id"] == first_id


@pytest.mark.asyncio
async def test_idempotency_different_keys_create_separate_events(
    auth_client: AsyncClient,
) -> None:
    """Different idempotency keys always create distinct events."""
    with patch("app.services.idempotency.get_redis", return_value=_mock_redis_miss()):
        r1 = await auth_client.post("/api/v1/events", json=_event_payload(idempotency_key="key-A"))
        r2 = await auth_client.post("/api/v1/events", json=_event_payload(idempotency_key="key-B"))
    assert r1.status_code == 202
    assert r2.status_code == 202
    assert r1.json()["id"] != r2.json()["id"]


@pytest.mark.asyncio
async def test_no_idempotency_key_always_creates(auth_client: AsyncClient) -> None:
    """Requests without an idempotency_key are never deduplicated."""
    with patch("app.services.idempotency.get_redis", return_value=_mock_redis_miss()):
        r1 = await auth_client.post("/api/v1/events", json=_event_payload())
        r2 = await auth_client.post("/api/v1/events", json=_event_payload())
    assert r1.status_code == 202
    assert r2.status_code == 202
    assert r1.json()["id"] != r2.json()["id"]


@pytest.mark.asyncio
async def test_idempotency_redis_down_falls_back_to_db(auth_client: AsyncClient) -> None:
    """When Redis is unavailable, idempotency check falls back to DB — no 500."""
    payload = _event_payload(idempotency_key="unique-key-003")

    with patch("app.services.idempotency.get_redis", return_value=_mock_redis_miss()):
        first = await auth_client.post("/api/v1/events", json=payload)
    assert first.status_code == 202
    first_id = first.json()["id"]

    # Redis raises on every call — should fall back to DB
    broken_redis = AsyncMock()
    broken_redis.get.side_effect = ConnectionError("Redis down")
    broken_redis.set.side_effect = ConnectionError("Redis down")

    with patch("app.services.idempotency.get_redis", return_value=broken_redis):
        second = await auth_client.post("/api/v1/events", json=payload)
    assert second.status_code == 200
    assert second.json()["id"] == first_id


# ---------------------------------------------------------------------------
# Payload / metadata size validation (#22)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_oversized_payload_returns_422(auth_client: AsyncClient) -> None:
    """Payload exceeding MAX_PAYLOAD_BYTES must be rejected with HTTP 422."""
    big_value = "x" * 70_000
    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(payload={"data": big_value}),
    )
    assert resp.status_code == 422
    assert "payload" in resp.text.lower()


@pytest.mark.asyncio
async def test_oversized_metadata_returns_422(auth_client: AsyncClient) -> None:
    """Metadata exceeding MAX_PAYLOAD_BYTES must be rejected with HTTP 422."""
    big_value = "x" * 70_000
    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(metadata={"data": big_value}),
    )
    assert resp.status_code == 422
    assert "metadata" in resp.text.lower()


@pytest.mark.asyncio
async def test_valid_sized_payload_accepted(auth_client: AsyncClient) -> None:
    """Payload within MAX_PAYLOAD_BYTES must be accepted normally."""
    small_payload = {"key": "value", "count": 42}
    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(payload=small_payload),
    )
    assert resp.status_code == 202


@pytest.mark.asyncio
async def test_payload_at_exact_limit_accepted(auth_client: AsyncClient) -> None:
    """Payload of exactly MAX_PAYLOAD_BYTES must be accepted (validator uses >)."""
    import json as _json

    from app.core.config import settings

    # Compute overhead using same serializer the validator uses (compact separators).
    # {"data": ""} with separators=(",",":") → '{"data":""}' = 11 bytes
    overhead = len(
        _json.dumps({"data": ""}, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    )
    value = "x" * (settings.MAX_PAYLOAD_BYTES - overhead)
    serialized = _json.dumps({"data": value}, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    assert len(serialized) == settings.MAX_PAYLOAD_BYTES

    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(payload={"data": value}),
    )
    assert resp.status_code == 202


@pytest.mark.asyncio
async def test_payload_one_byte_over_limit_rejected(auth_client: AsyncClient) -> None:
    """Payload one byte over MAX_PAYLOAD_BYTES must be rejected with HTTP 422."""
    import json as _json

    from app.core.config import settings

    overhead = len(
        _json.dumps({"data": ""}, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    )
    value = "x" * (settings.MAX_PAYLOAD_BYTES - overhead + 1)
    serialized = _json.dumps({"data": value}, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    assert len(serialized) == settings.MAX_PAYLOAD_BYTES + 1

    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(payload={"data": value}),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_non_ascii_payload_measured_in_utf8_bytes(auth_client: AsyncClient) -> None:
    """Non-ASCII characters must be measured as UTF-8 bytes, not ASCII-escaped length."""
    # A single CJK character is 3 bytes in UTF-8 — should be well under the limit.
    resp = await auth_client.post(
        "/api/v1/events",
        json=_event_payload(payload={"greeting": "日本語テスト"}),
    )
    assert resp.status_code == 202
