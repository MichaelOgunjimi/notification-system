"""Tests for the retry logic — backoff, eligibility, DLQ movement, and integration.

Uses a real PostgreSQL sync session (test DB) to verify:
- Exponential backoff calculation with/without jitter
- Retry eligibility per error type and policy
- Notification re-enqueued on retryable failure
- Dead letter queue entry created when retries exhausted
- Permanent failures skip retry entirely
- Event completion considers DLQ as terminal
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from pydantic import PostgresDsn
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool
from sqlmodel import col

import app.model_registry  # noqa: F401
from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.delivery.adapters.base import DeliveryResult
from app.modules.delivery.dead_letter.model import DeadLetterMessage
from app.modules.delivery.enums import DeadLetterStatus
from app.modules.delivery.processing.channel import _maybe_complete_event, process_notification
from app.modules.delivery.processing.retry import calculate_backoff, should_retry
from app.modules.delivery.settings.retry_model import RetryPolicy
from app.modules.events.enums import EventStatus
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.notifications.log_model import NotificationLog
from app.modules.notifications.model import Notification
from tests.helpers import create_sync_project_api_key

SYNC_TEST_DB_URL = str(
    PostgresDsn.build(
        scheme="postgresql+psycopg2",
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        path=f"{settings.POSTGRES_DB}_test",
    )
)

sync_test_engine = create_engine(SYNC_TEST_DB_URL, poolclass=NullPool)
SyncTestSession = sessionmaker(bind=sync_test_engine, class_=Session, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _clean_sync_tables():
    yield
    with sync_test_engine.connect() as conn:
        conn.execute(
            text(
                "TRUNCATE notification_logs, dead_letter_messages, notifications, "
                "events, templates, channel_configs, retry_policies, api_keys CASCADE"
            )
        )
        conn.commit()


def _get_test_session() -> Session:
    return SyncTestSession()


def _seed_retry_policy(
    session: Session,
    channel: NotificationChannel = NotificationChannel.EMAIL,
    max_retries: int = 3,
    base_delay_seconds: int = 10,
    max_backoff_seconds: int = 600,
    jitter_enabled: bool = False,
    retry_on_timeout: bool = True,
    retry_on_5xx: bool = True,
    retry_on_4xx: bool = False,
) -> RetryPolicy:
    """Insert a retry policy for testing."""
    policy = RetryPolicy(
        id=uuid.uuid4(),
        channel=channel,
        max_retries=max_retries,
        base_delay_seconds=base_delay_seconds,
        max_backoff_seconds=max_backoff_seconds,
        jitter_enabled=jitter_enabled,
        retry_on_timeout=retry_on_timeout,
        retry_on_5xx=retry_on_5xx,
        retry_on_4xx=retry_on_4xx,
    )
    session.add(policy)
    session.commit()
    return policy


def _seed_event_and_notification(
    session: Session,
    status: NotificationStatus = NotificationStatus.QUEUED,
    channel: str = "email",
    retry_count: int = 0,
) -> tuple[Event, Notification]:
    """Insert a minimal api_key + event + notification into the test DB."""
    api_key = create_sync_project_api_key(session, name="retry-test-key")

    event = Event(
        id=uuid.uuid4(),
        event_type="test.event",
        payload={"msg": "hello"},
        status=EventStatus.PROCESSING,
        api_key_id=api_key.id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(event)
    session.flush()

    notification = Notification(
        id=uuid.uuid4(),
        event_id=event.id,
        channel=channel,
        recipient_user_id="test-user-1",
        recipient_address="user@test.com",
        status=status,
        retry_count=retry_count,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(notification)
    session.commit()
    return event, notification


# ---------------------------------------------------------------------------
# Unit tests: calculate_backoff
# ---------------------------------------------------------------------------
class TestCalculateBackoff:
    def test_exponential_growth_no_jitter(self):
        assert calculate_backoff(0, base_delay=10, max_backoff=600, jitter=False) == 10.0
        assert calculate_backoff(1, base_delay=10, max_backoff=600, jitter=False) == 20.0
        assert calculate_backoff(2, base_delay=10, max_backoff=600, jitter=False) == 40.0
        assert calculate_backoff(3, base_delay=10, max_backoff=600, jitter=False) == 80.0

    def test_capped_at_max_backoff(self):
        result = calculate_backoff(10, base_delay=10, max_backoff=600, jitter=False)
        assert result == 600.0

    def test_jitter_within_range(self):
        """With jitter, delay should be between 50% and 150% of base calculation."""
        results = [calculate_backoff(0, 10, 600, jitter=True) for _ in range(100)]
        assert all(5.0 <= r <= 15.0 for r in results)
        # Verify there's actual variance (not all the same)
        assert len(set(results)) > 1


# ---------------------------------------------------------------------------
# Unit tests: should_retry
# ---------------------------------------------------------------------------
class TestShouldRetry:
    def _make_notification(self, retry_count: int = 0) -> Notification:
        return Notification(
            id=uuid.uuid4(),
            event_id=uuid.uuid4(),
            channel=NotificationChannel.EMAIL,
            recipient_user_id="u1",
            recipient_address="a@b.com",
            status=NotificationStatus.PROCESSING,
            retry_count=retry_count,
        )

    def _make_policy(self, **kwargs) -> RetryPolicy:
        defaults = {
            "channel": NotificationChannel.EMAIL,
            "max_retries": 3,
            "base_delay_seconds": 10,
            "max_backoff_seconds": 600,
            "jitter_enabled": False,
            "retry_on_timeout": True,
            "retry_on_5xx": True,
            "retry_on_4xx": False,
        }
        defaults.update(kwargs)
        return RetryPolicy(**defaults)

    def test_retryable_server_error(self):
        assert should_retry(self._make_notification(0), self._make_policy(), "server_error")

    def test_retryable_timeout(self):
        assert should_retry(self._make_notification(0), self._make_policy(), "timeout")

    def test_retryable_connection_error(self):
        assert should_retry(self._make_notification(0), self._make_policy(), "connection_error")

    def test_not_retryable_permanent_failure(self):
        n = self._make_notification(0)
        assert not should_retry(n, self._make_policy(), "permanent_failure")

    def test_not_retryable_provider_not_configured(self):
        assert not should_retry(
            self._make_notification(0), self._make_policy(), "provider_not_configured"
        )

    def test_not_retryable_client_error_by_default(self):
        assert not should_retry(self._make_notification(0), self._make_policy(), "client_error")

    def test_retryable_client_error_when_enabled(self):
        policy = self._make_policy(retry_on_4xx=True)
        assert should_retry(self._make_notification(0), policy, "client_error")

    def test_not_retryable_timeout_when_disabled(self):
        policy = self._make_policy(retry_on_timeout=False)
        assert not should_retry(self._make_notification(0), policy, "timeout")

    def test_exhausted_retries(self):
        assert not should_retry(self._make_notification(3), self._make_policy(), "server_error")

    def test_one_retry_left(self):
        assert should_retry(self._make_notification(2), self._make_policy(), "server_error")


# ---------------------------------------------------------------------------
# Integration tests: retry in process_notification
# ---------------------------------------------------------------------------
class TestRetryIntegration:
    """Tests that process_notification correctly retries or dead-letters."""

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_failure_triggers_retry(self, mock_get_adapter, mock_get_session):
        """First failure with retry policy → QUEUED + re-enqueue."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        _seed_retry_policy(session, jitter_enabled=False, base_delay_seconds=10)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False,
            error_message="Webhook returned 500",
            error_type="server_error",
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        mock_celery_task = MagicMock()

        result = process_notification(str(notification.id), "email", celery_task=mock_celery_task)

        assert result["status"] == "retry_scheduled"
        assert result["retry_count"] == 1
        assert result["countdown_seconds"] == 10.0

        # Verify DB state
        check = _get_test_session()
        n = check.get(Notification, notification.id)
        assert n.status == NotificationStatus.QUEUED
        assert n.retry_count == 1
        assert n.next_retry_at is not None
        check.close()

        # Verify Celery re-enqueue
        mock_celery_task.apply_async.assert_called_once()
        call_kwargs = mock_celery_task.apply_async.call_args
        assert call_kwargs.kwargs["countdown"] == 10.0

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_exhausted_retries_to_dlq(self, mock_get_adapter, mock_get_session):
        """Notification with retry_count == max_retries → dead letter queue."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session, retry_count=3)
        _seed_retry_policy(session, max_retries=3, jitter_enabled=False)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False,
            error_message="Webhook returned 500",
            error_type="server_error",
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        result = process_notification(str(notification.id), "email", celery_task=MagicMock())

        assert result["status"] == NotificationStatus.DEAD_LETTER

        # Verify DB state
        check = _get_test_session()
        n = check.get(Notification, notification.id)
        assert n.status == NotificationStatus.DEAD_LETTER
        assert n.failed_at is not None

        # Verify DLQ record created
        dlq = check.execute(
            select(DeadLetterMessage).where(
                col(DeadLetterMessage.notification_id) == notification.id
            )
        ).scalar_one_or_none()
        assert dlq is not None
        assert dlq.error_type == "server_error"
        assert dlq.retry_count == 3
        assert dlq.status == DeadLetterStatus.ACTIVE
        check.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_permanent_failure_skips_retry(self, mock_get_adapter, mock_get_session):
        """Permanent failure (e.g., SSRF) → FAILED immediately, no retry."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        _seed_retry_policy(session, max_retries=5)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False,
            error_message="Webhook URL resolves to internal address",
            error_type="permanent_failure",
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        mock_celery_task = MagicMock()
        result = process_notification(str(notification.id), "email", celery_task=mock_celery_task)

        assert result["status"] == NotificationStatus.FAILED

        # Should NOT re-enqueue
        mock_celery_task.apply_async.assert_not_called()

        # Verify notification is FAILED (not dead_letter since retry_count=0)
        check = _get_test_session()
        n = check.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        assert n.retry_count == 0
        check.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_permanent_failure_after_retries_goes_to_failed_not_dlq(
        self, mock_get_adapter, mock_get_session
    ):
        """Permanent failure mid-retry → FAILED, not DLQ.

        If a notification previously retried for transient errors but then
        hits a permanent error (e.g. invalid recipient), it should be FAILED
        not moved to the dead letter queue.
        """
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session, retry_count=2)
        _seed_retry_policy(session, max_retries=5)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False,
            error_message="Invalid email address",
            error_type="permanent_failure",
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        mock_celery_task = MagicMock()
        result = process_notification(str(notification.id), "email", celery_task=mock_celery_task)

        assert result["status"] == NotificationStatus.FAILED
        mock_celery_task.apply_async.assert_not_called()

        check = _get_test_session()
        n = check.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        assert n.retry_count == 2  # unchanged — no new retry attempted

        # Verify it did NOT go to DLQ
        from sqlalchemy import select
        from sqlmodel import col

        from app.modules.delivery.dead_letter.model import DeadLetterMessage

        dlq = check.execute(
            select(DeadLetterMessage).where(
                col(DeadLetterMessage.notification_id) == notification.id
            )
        ).scalar_one_or_none()
        assert dlq is None, "Permanent failure should not create a DLQ entry"
        check.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_retry_increments_count(self, mock_get_adapter, mock_get_session):
        """Each retry attempt increments retry_count."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session, retry_count=1)
        _seed_retry_policy(session, max_retries=5, base_delay_seconds=10, jitter_enabled=False)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False, error_message="timeout", error_type="timeout"
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        result = process_notification(str(notification.id), "email", celery_task=MagicMock())

        assert result["status"] == "retry_scheduled"
        assert result["retry_count"] == 2
        # backoff for retry_count=1: 10 * 2^1 = 20
        assert result["countdown_seconds"] == 20.0

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_no_policy_means_immediate_failure(self, mock_get_adapter, mock_get_session):
        """Without a retry policy, failures are immediately FAILED."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        # No retry policy seeded
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False, error_message="Server error", error_type="server_error"
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        result = process_notification(str(notification.id), "email", celery_task=MagicMock())

        assert result["status"] == NotificationStatus.FAILED

        check = _get_test_session()
        n = check.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        check.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_retry_log_entries_created(self, mock_get_adapter, mock_get_session):
        """Retry creates a log entry with retry metadata."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        _seed_retry_policy(session, jitter_enabled=False, base_delay_seconds=10)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False, error_message="500 error", error_type="server_error"
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        process_notification(str(notification.id), "email", celery_task=MagicMock())

        check = _get_test_session()
        logs = (
            check.execute(
                select(NotificationLog)
                .where(col(NotificationLog.notification_id) == notification.id)
                .order_by(col(NotificationLog.created_at))
            )
            .scalars()
            .all()
        )
        # Should have: QUEUED→PROCESSING, PROCESSING→QUEUED (retry)
        assert len(logs) == 2
        retry_log = logs[-1]
        assert retry_log.new_status == NotificationStatus.QUEUED
        assert retry_log.metadata_ is not None
        assert retry_log.metadata_["retry_count"] == 1
        assert retry_log.metadata_["error_type"] == "server_error"
        check.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_dlq_log_entries_created(self, mock_get_adapter, mock_get_session):
        """DLQ movement creates a log entry."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session, retry_count=3)
        _seed_retry_policy(session, max_retries=3)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False, error_message="timeout", error_type="timeout"
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        process_notification(str(notification.id), "email", celery_task=MagicMock())

        check = _get_test_session()
        logs = (
            check.execute(
                select(NotificationLog)
                .where(col(NotificationLog.notification_id) == notification.id)
                .order_by(col(NotificationLog.created_at))
            )
            .scalars()
            .all()
        )
        dlq_log = logs[-1]
        assert dlq_log.new_status == NotificationStatus.DEAD_LETTER
        assert "Exhausted 3 retries" in (dlq_log.error_message or "")
        check.close()


class TestEventCompletionWithRetry:
    """Event completion should not fire while retries are in-flight."""

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_retry_keeps_event_processing(self, mock_get_adapter, mock_get_session):
        """When a notification retries, event stays PROCESSING (not terminal)."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        _seed_retry_policy(session, jitter_enabled=False)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False, error_message="500", error_type="server_error"
        )
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        process_notification(str(notification.id), "email", celery_task=MagicMock())

        # Event should still be PROCESSING since notification is QUEUED (not terminal)
        check = _get_test_session()
        e = check.get(Event, event.id)
        assert e.status == EventStatus.PROCESSING
        check.close()

    def test_dlq_is_terminal_for_event_completion(self):
        """DEAD_LETTER is terminal — event should complete when all are DLQ."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        notification.status = NotificationStatus.DEAD_LETTER
        session.commit()

        _maybe_complete_event(session, event.id)

        event = session.get(Event, event.id)
        assert event.status == EventStatus.FAILED
        session.close()
