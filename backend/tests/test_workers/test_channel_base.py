"""Tests for the worker channel_base pipeline.

Uses a real PostgreSQL sync session (test DB) to verify:
- SELECT FOR UPDATE prevents double-delivery
- Template errors → FAILED, not stuck PROCESSING
- Unexpected errors after PROCESSING commit → FAILED recovery
- Successful and failed delivery flows
- _maybe_complete_event logic
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from pydantic import PostgresDsn
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401
from app.core.config import settings
from app.models.api_key import ApiKey
from app.models.enums import EventStatus, NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.services.integrations.base import DeliveryResult
from app.utils.datetime import utc_now
from app.workers.channel_base import _maybe_complete_event, process_notification

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


def _seed_event_and_notification(
    session: Session,
    status: NotificationStatus = NotificationStatus.QUEUED,
    channel: str = "email",
) -> tuple[Event, Notification]:
    """Insert a minimal api_key + event + notification into the test DB."""
    api_key = ApiKey(
        id=uuid.uuid4(),
        key_hash="testhash_" + uuid.uuid4().hex,
        key_prefix="test_pref",
        name="worker-test-key",
        is_active=True,
        created_at=utc_now(),
    )
    session.add(api_key)
    session.flush()

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
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(notification)
    session.commit()
    return event, notification


class TestProcessNotification:
    """Tests for process_notification()."""

    @patch("app.workers.channel_base.get_sync_session")
    @patch("app.workers.channel_base.get_adapter")
    def test_successful_delivery(self, mock_get_adapter, mock_get_session):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=True, provider_response={"status": "ok"}
        )
        mock_get_adapter.return_value = mock_adapter

        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(notification.id), "email")

        assert result["status"] == "delivered"
        assert result["notification_id"] == str(notification.id)

        verify_session = _get_test_session()
        n = verify_session.get(Notification, notification.id)
        assert n.status == NotificationStatus.DELIVERED
        assert n.delivered_at is not None
        verify_session.close()

    @patch("app.workers.channel_base.get_sync_session")
    @patch("app.workers.channel_base.get_adapter")
    def test_failed_delivery(self, mock_get_adapter, mock_get_session):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False, error_message="Provider error"
        )
        mock_get_adapter.return_value = mock_adapter

        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(notification.id), "email")

        assert result["status"] == "failed"

        verify_session = _get_test_session()
        n = verify_session.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        assert "Provider error" in n.error_message
        verify_session.close()

    @patch("app.workers.channel_base.get_sync_session")
    @patch("app.workers.channel_base.get_adapter")
    def test_already_processed_skipped(self, mock_get_adapter, mock_get_session):
        """Notification already DELIVERED should be skipped (idempotency)."""
        session = _get_test_session()
        _event, notification = _seed_event_and_notification(
            session, status=NotificationStatus.DELIVERED
        )
        session.close()

        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(notification.id), "email")

        assert result["status"] == "skipped"
        mock_get_adapter.assert_not_called()

    @patch("app.workers.channel_base.get_sync_session")
    def test_notification_not_found(self, mock_get_session):
        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(uuid.uuid4()), "email")
        assert result["status"] == "error"
        assert result["reason"] == "notification_not_found"

    @patch("app.workers.channel_base.get_sync_session")
    @patch("app.workers.channel_base.get_adapter")
    def test_template_error_marks_failed(self, mock_get_adapter, mock_get_session):
        """Template rendering error → FAILED, not stuck in PROCESSING."""
        session = _get_test_session()
        _event, notification = _seed_event_and_notification(session)
        session.close()

        mock_get_session.return_value = _get_test_session()

        with patch(
            "app.workers.channel_base._render_body",
            side_effect=Exception("Jinja2 UndefinedError: 'name' is undefined"),
        ):
            result = process_notification(str(notification.id), "email")

        assert result["status"] == "failed"
        assert "template_error" in result["reason"]

        verify_session = _get_test_session()
        n = verify_session.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        assert "Template error" in n.error_message
        verify_session.close()

        mock_get_adapter.assert_not_called()

    @patch("app.workers.channel_base.get_sync_session")
    @patch("app.workers.channel_base.get_adapter")
    def test_unexpected_error_recovers_from_processing(self, mock_get_adapter, mock_get_session):
        """If adapter.send() raises, notification moves to FAILED not zombie PROCESSING."""
        session = _get_test_session()
        _event, notification = _seed_event_and_notification(session)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.side_effect = RuntimeError("Connection exploded")
        mock_get_adapter.return_value = mock_adapter

        mock_get_session.return_value = _get_test_session()

        with pytest.raises(RuntimeError, match="Connection exploded"):
            process_notification(str(notification.id), "email")

        verify_session = _get_test_session()
        n = verify_session.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        assert n.error_message == "Unexpected worker error"
        verify_session.close()

    @patch("app.workers.channel_base.get_sync_session")
    @patch("app.workers.channel_base.get_adapter")
    def test_logs_created_for_transitions(self, mock_get_adapter, mock_get_session):
        """Verify NotificationLog entries are created for each status transition."""
        session = _get_test_session()
        _event, notification = _seed_event_and_notification(session)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(success=True)
        mock_get_adapter.return_value = mock_adapter

        mock_get_session.return_value = _get_test_session()
        process_notification(str(notification.id), "email")

        verify_session = _get_test_session()
        logs = (
            verify_session.execute(
                select(NotificationLog)
                .where(NotificationLog.notification_id == notification.id)
                .order_by(NotificationLog.created_at)
            )
            .scalars()
            .all()
        )
        assert len(logs) == 2
        assert logs[0].new_status == NotificationStatus.PROCESSING
        assert logs[1].new_status == NotificationStatus.DELIVERED
        verify_session.close()


class TestMaybeCompleteEvent:
    """Tests for _maybe_complete_event()."""

    def test_all_delivered_marks_completed(self):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(
            session, status=NotificationStatus.DELIVERED
        )

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.COMPLETED
        session.close()

    def test_mixed_results_marks_partially_failed(self):
        session = _get_test_session()
        api_key = ApiKey(
            id=uuid.uuid4(),
            key_hash="testhash_" + uuid.uuid4().hex,
            key_prefix="test_pref",
            name="worker-test-key",
            is_active=True,
            created_at=utc_now(),
        )
        session.add(api_key)
        session.flush()

        event = Event(
            id=uuid.uuid4(),
            event_type="test.event",
            payload={},
            status=EventStatus.PROCESSING,
            api_key_id=api_key.id,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(event)
        session.flush()

        n1 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="email",
            recipient_user_id="test-user-1",
            recipient_address="a@test.com",
            status=NotificationStatus.DELIVERED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        n2 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="sms",
            recipient_user_id="test-user-1",
            recipient_address="+15551234567",
            status=NotificationStatus.FAILED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add_all([n1, n2])
        session.commit()

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.PARTIALLY_FAILED
        session.close()

    def test_inflight_notification_keeps_processing(self):
        """If one notification is still QUEUED, event stays PROCESSING."""
        session = _get_test_session()
        api_key = ApiKey(
            id=uuid.uuid4(),
            key_hash="testhash_" + uuid.uuid4().hex,
            key_prefix="test_pref",
            name="worker-test-key",
            is_active=True,
            created_at=utc_now(),
        )
        session.add(api_key)
        session.flush()

        event = Event(
            id=uuid.uuid4(),
            event_type="test.event",
            payload={},
            status=EventStatus.PROCESSING,
            api_key_id=api_key.id,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(event)
        session.flush()

        n1 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="email",
            recipient_user_id="test-user-1",
            recipient_address="a@test.com",
            status=NotificationStatus.DELIVERED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        n2 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="sms",
            recipient_user_id="test-user-1",
            recipient_address="+15551234567",
            status=NotificationStatus.QUEUED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add_all([n1, n2])
        session.commit()

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.PROCESSING
        session.close()
