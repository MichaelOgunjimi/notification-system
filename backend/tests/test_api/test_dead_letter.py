"""Tests for the dead letter queue management API.

Covers: list, detail, retry, discard, cross-tenant isolation, and edge cases.
"""

import uuid
from unittest.mock import patch

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey
from app.models.dead_letter import DeadLetterMessage
from app.models.enums import (
    DeadLetterStatus,
    EventStatus,
    NotificationChannel,
    NotificationStatus,
)
from app.models.event import Event
from app.models.notification import Notification
from app.utils.datetime import utc_now

BASE_URL = "/api/v1/dead-letter"


async def _seed_dlq(
    db: AsyncSession,
    api_key: ApiKey,
    *,
    channel: str = "email",
    error_type: str = "server_error",
    status: DeadLetterStatus = DeadLetterStatus.ACTIVE,
    retry_count: int = 3,
) -> tuple[Event, Notification, DeadLetterMessage]:
    """Seed api_key → event → notification → DLQ message."""
    now = utc_now()
    event = Event(
        id=uuid.uuid4(),
        event_type="test.dlq",
        payload={"key": "value"},
        status=EventStatus.FAILED,
        api_key_id=api_key.id,
        created_at=now,
        updated_at=now,
    )
    db.add(event)
    await db.flush()

    notification = Notification(
        id=uuid.uuid4(),
        event_id=event.id,
        channel=channel,
        recipient_user_id="test-user",
        recipient_address="user@test.com",
        status=NotificationStatus.DEAD_LETTER,
        retry_count=retry_count,
        error_message="Server error after retries",
        failed_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(notification)
    await db.flush()

    dlq = DeadLetterMessage(
        id=uuid.uuid4(),
        notification_id=notification.id,
        channel=NotificationChannel(channel),
        recipient_address=notification.recipient_address,
        event_payload=event.payload or {},
        error_type=error_type,
        error_message="Server error after retries",
        retry_count=retry_count,
        retry_history=[
            {"attempt": i + 1, "error_type": error_type, "error_message": "500"}
            for i in range(retry_count)
        ],
        status=status,
        failed_at=now,
    )
    db.add(dlq)
    await db.commit()
    return event, notification, dlq


class TestListDeadLetters:
    async def test_list_empty(self, auth_client: AsyncClient):
        resp = await auth_client.get(BASE_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []

    async def test_list_returns_dlq_messages(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        await _seed_dlq(db, api_key)
        await _seed_dlq(db, api_key, channel="webhook", error_type="timeout")

        resp = await auth_client.get(BASE_URL)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    async def test_filter_by_channel(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        await _seed_dlq(db, api_key, channel="email")
        await _seed_dlq(db, api_key, channel="webhook")

        resp = await auth_client.get(BASE_URL, params={"channel": "email"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["channel"] == "email"

    async def test_filter_by_status(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        await _seed_dlq(db, api_key, status=DeadLetterStatus.ACTIVE)
        await _seed_dlq(db, api_key, status=DeadLetterStatus.DISCARDED)

        resp = await auth_client.get(BASE_URL, params={"status": "active"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["status"] == "active"

    async def test_pagination(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        for _ in range(5):
            await _seed_dlq(db, api_key)

        resp = await auth_client.get(BASE_URL, params={"page": 1, "per_page": 2})
        data = resp.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2
        assert data["total_pages"] == 3

    async def test_requires_auth(self, client: AsyncClient):
        resp = await client.get(BASE_URL)
        assert resp.status_code in (401, 422)


class TestGetDeadLetter:
    async def test_get_detail(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        _, _, dlq = await _seed_dlq(db, api_key)

        resp = await auth_client.get(f"{BASE_URL}/{dlq.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(dlq.id)
        assert data["error_type"] == "server_error"
        assert data["retry_count"] == 3
        assert len(data["retry_history"]) == 3
        assert data["event_payload"] == {"key": "value"}

    async def test_not_found(self, auth_client: AsyncClient):
        resp = await auth_client.get(f"{BASE_URL}/{uuid.uuid4()}")
        assert resp.status_code == 404


class TestRetryDeadLetter:
    @patch("app.services.dead_letter_service.celery_app.send_task")
    async def test_retry_resets_notification(
        self,
        mock_send_task,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        _, notification, dlq = await _seed_dlq(db, api_key)

        resp = await auth_client.post(f"{BASE_URL}/{dlq.id}/retry")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "retried"
        assert data["retried_at"] is not None

        # Verify notification was reset
        await db.refresh(notification)
        assert notification.status == NotificationStatus.QUEUED
        assert notification.retry_count == 0
        assert notification.error_message is None

        # Verify Celery enqueue
        mock_send_task.assert_called_once_with(
            "app.workers.email_worker.send_email",
            args=[str(notification.id)],
        )

    async def test_retry_already_retried_returns_404(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        _, _, dlq = await _seed_dlq(db, api_key, status=DeadLetterStatus.RETRIED)

        resp = await auth_client.post(f"{BASE_URL}/{dlq.id}/retry")
        assert resp.status_code == 404

    async def test_retry_not_found(self, auth_client: AsyncClient):
        resp = await auth_client.post(f"{BASE_URL}/{uuid.uuid4()}/retry")
        assert resp.status_code == 404


class TestDiscardDeadLetter:
    async def test_discard_marks_discarded(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        _, _, dlq = await _seed_dlq(db, api_key)

        resp = await auth_client.post(f"{BASE_URL}/{dlq.id}/discard")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "discarded"
        assert data["discarded_at"] is not None

    async def test_discard_already_discarded_returns_404(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key, _ = api_key_pair
        _, _, dlq = await _seed_dlq(db, api_key, status=DeadLetterStatus.DISCARDED)

        resp = await auth_client.post(f"{BASE_URL}/{dlq.id}/discard")
        assert resp.status_code == 404


class TestCrossTenantIsolation:
    async def test_cannot_see_other_tenants_dlq(
        self,
        auth_client: AsyncClient,
        auth_client_b: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
        api_key_pair_b: tuple[ApiKey, str],
    ):
        api_key_a, _ = api_key_pair
        api_key_b, _ = api_key_pair_b

        _, _, dlq_a = await _seed_dlq(db, api_key_a)
        await _seed_dlq(db, api_key_b)

        # Client A should see only their DLQ message
        resp_a = await auth_client.get(BASE_URL)
        assert resp_a.json()["total"] == 1
        assert resp_a.json()["items"][0]["id"] == str(dlq_a.id)

        # Client B should see only their DLQ message
        resp_b = await auth_client_b.get(BASE_URL)
        assert resp_b.json()["total"] == 1
        assert resp_b.json()["items"][0]["id"] != str(dlq_a.id)

    async def test_cannot_retry_other_tenants_dlq(
        self,
        auth_client_b: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key_a, _ = api_key_pair
        _, _, dlq_a = await _seed_dlq(db, api_key_a)

        # Client B cannot retry Client A's DLQ message
        resp = await auth_client_b.post(f"{BASE_URL}/{dlq_a.id}/retry")
        assert resp.status_code == 404

    async def test_cannot_get_other_tenants_dlq(
        self,
        auth_client_b: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        api_key_a, _ = api_key_pair
        _, _, dlq_a = await _seed_dlq(db, api_key_a)

        resp = await auth_client_b.get(f"{BASE_URL}/{dlq_a.id}")
        assert resp.status_code == 404


class TestDiscardThenRetry:
    async def test_retry_after_discard_returns_404(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        """Discarded DLQ entries cannot be retried — state transition is terminal."""
        api_key, _ = api_key_pair
        _, _, dlq = await _seed_dlq(db, api_key)

        # Discard first
        resp = await auth_client.post(f"{BASE_URL}/{dlq.id}/discard")
        assert resp.status_code == 200

        # Retry should fail — discarded is terminal
        resp = await auth_client.post(f"{BASE_URL}/{dlq.id}/retry")
        assert resp.status_code == 404

    async def test_discard_after_retry_returns_404(
        self,
        auth_client: AsyncClient,
        db: AsyncSession,
        api_key_pair: tuple[ApiKey, str],
    ):
        """Retried DLQ entries cannot be discarded — state transition is terminal."""
        api_key, _ = api_key_pair
        _, _, dlq = await _seed_dlq(db, api_key)

        # Retry first
        with patch("app.services.dead_letter_service.celery_app"):
            resp = await auth_client.post(f"{BASE_URL}/{dlq.id}/retry")
            assert resp.status_code == 200

        # Discard should fail — retried is terminal
        resp = await auth_client.post(f"{BASE_URL}/{dlq.id}/discard")
        assert resp.status_code == 404
