"""Tests for dispatcher — commit-before-enqueue ordering and partial failure."""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from pydantic import PostgresDsn
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

import app.model_registry  # noqa: F401
from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.delivery.processing.dispatcher import _enqueue_channel_task, dispatch_event
from app.modules.events.enums import EventStatus
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationStatus
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


def _seed_event_with_notifications(
    session: Session,
    channels: list[str] | None = None,
    priority: str = "medium",
) -> tuple[Event, list[Notification]]:
    """Create an event with PENDING notifications for each channel."""
    if channels is None:
        channels = ["email", "sms"]

    api_key = create_sync_project_api_key(session, name="dispatch-test-key")

    event = Event(
        id=uuid.uuid4(),
        event_type="test.dispatch",
        payload={"key": "value"},
        status=EventStatus.ACCEPTED,
        api_key_id=api_key.id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(event)
    session.flush()

    notifications = []
    for ch in channels:
        n = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel=ch,
            priority=priority,
            recipient_user_id="test-user-1",
            recipient_address="user@test.com" if ch == "email" else "+15551234567",
            status=NotificationStatus.PENDING,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(n)
        notifications.append(n)

    session.commit()
    return event, notifications


class TestDispatchEvent:
    """Tests for dispatch_event task."""

    @patch("app.modules.delivery.processing.dispatcher.get_sync_session")
    @patch("app.modules.delivery.processing.dispatcher._enqueue_channel_task")
    def test_commit_before_enqueue(self, mock_enqueue, mock_get_session):
        """DB commit happens before Celery enqueue calls."""
        session = _get_test_session()
        event, notifications = _seed_event_with_notifications(session)
        session.close()

        call_order: list[str] = []
        real_session = _get_test_session()
        original_commit = real_session.commit

        def tracking_commit():
            call_order.append("commit")
            original_commit()

        def tracking_enqueue(*args, **kwargs):
            call_order.append("enqueue")

        real_session.commit = tracking_commit  # type: ignore[method-assign]
        mock_get_session.return_value = real_session
        mock_enqueue.side_effect = tracking_enqueue

        # dispatch_event is a Celery task — call the underlying function
        result = dispatch_event.apply(args=[str(event.id)]).get()

        assert result["status"] == "dispatched"
        assert result["notifications"] == 2

        # Verify ordering: all commits before any enqueue
        commit_indices = [i for i, c in enumerate(call_order) if c == "commit"]
        enqueue_indices = [i for i, c in enumerate(call_order) if c == "enqueue"]
        assert commit_indices, "Expected at least one commit"
        assert enqueue_indices, "Expected at least one enqueue"
        # The last commit should be before the first enqueue
        assert max(commit_indices) < min(enqueue_indices), (
            f"Commit must happen before enqueue. Order: {call_order}"
        )
        real_session.close()

    @patch("app.modules.delivery.processing.dispatcher.get_sync_session")
    @patch("app.modules.delivery.processing.dispatcher._enqueue_channel_task")
    def test_notifications_queued_in_db(self, mock_enqueue, mock_get_session):
        """All notifications should be QUEUED in DB after dispatch."""
        session = _get_test_session()
        event, notifications = _seed_event_with_notifications(session)
        n_ids = [n.id for n in notifications]
        session.close()

        mock_get_session.return_value = _get_test_session()
        dispatch_event.apply(args=[str(event.id)]).get()

        verify_session = _get_test_session()
        for nid in n_ids:
            n = verify_session.get(Notification, nid)
            assert n.status == NotificationStatus.QUEUED
            assert n.queued_at is not None
        verify_session.close()

    @patch("app.modules.delivery.processing.dispatcher.get_sync_session")
    @patch("app.modules.delivery.processing.dispatcher._enqueue_channel_task")
    def test_partial_enqueue_failure_leaves_queued(self, mock_enqueue, mock_get_session):
        """If one Celery enqueue fails, notifications stay QUEUED (not orphaned)."""
        session = _get_test_session()
        event, notifications = _seed_event_with_notifications(
            session, channels=["email", "sms", "webhook"]
        )
        n_ids = [n.id for n in notifications]
        session.close()

        # First two succeed, third fails
        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 3:
                raise ConnectionError("Redis connection lost")

        mock_enqueue.side_effect = side_effect
        mock_get_session.return_value = _get_test_session()

        result = dispatch_event.apply(args=[str(event.id)]).get()

        # 2 succeeded, 1 failed — but all 3 are QUEUED in DB
        assert result["notifications"] == 2

        verify_session = _get_test_session()
        for nid in n_ids:
            n = verify_session.get(Notification, nid)
            assert n.status == NotificationStatus.QUEUED, (
                f"Notification {nid} should be QUEUED even if enqueue failed"
            )
        verify_session.close()

    @patch("app.modules.delivery.processing.dispatcher.get_sync_session")
    @patch("app.modules.delivery.processing.dispatcher._enqueue_channel_task")
    def test_log_entries_created(self, mock_enqueue, mock_get_session):
        """NotificationLog entries should be created for PENDING → QUEUED."""
        session = _get_test_session()
        event, notifications = _seed_event_with_notifications(session)
        n_ids = [n.id for n in notifications]
        session.close()

        mock_get_session.return_value = _get_test_session()
        dispatch_event.apply(args=[str(event.id)]).get()

        verify_session = _get_test_session()
        for nid in n_ids:
            logs = (
                verify_session.execute(
                    select(NotificationLog).where(NotificationLog.notification_id == nid)
                )
                .scalars()
                .all()
            )
            assert len(logs) == 1
            assert logs[0].previous_status == NotificationStatus.PENDING
            assert logs[0].new_status == NotificationStatus.QUEUED
        verify_session.close()

    @patch("app.modules.delivery.processing.dispatcher.get_sync_session")
    def test_event_not_found(self, mock_get_session):
        mock_get_session.return_value = _get_test_session()
        result = dispatch_event.apply(args=[str(uuid.uuid4())]).get()
        assert result["status"] == "error"
        assert result["reason"] == "event_not_found"

    @patch("app.modules.delivery.processing.dispatcher.get_sync_session")
    @patch("app.modules.delivery.processing.dispatcher._enqueue_channel_task")
    def test_event_status_updated_to_processing(self, mock_enqueue, mock_get_session):
        """Event status should be PROCESSING after dispatch."""
        session = _get_test_session()
        event, _notifications = _seed_event_with_notifications(session)
        session.close()

        mock_get_session.return_value = _get_test_session()
        dispatch_event.apply(args=[str(event.id)]).get()

        verify_session = _get_test_session()
        e = verify_session.get(Event, event.id)
        assert e.status == EventStatus.PROCESSING
        verify_session.close()


class TestPerChannelPriorityRouting:
    """Tests that _enqueue_channel_task routes to per-channel priority queues."""

    def _make_notification(self, channel: str, priority: str) -> Notification:
        return Notification(
            id=uuid.uuid4(),
            event_id=uuid.uuid4(),
            channel=channel,
            priority=priority,
            recipient_user_id="user-1",
            recipient_address="test@example.com",
            status=NotificationStatus.QUEUED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )

    @pytest.mark.parametrize(
        ("channel", "priority"),
        [
            ("email", "high"),
            ("email", "medium"),
            ("email", "low"),
            ("sms", "high"),
            ("sms", "medium"),
            ("sms", "low"),
            ("webhook", "high"),
            ("webhook", "medium"),
            ("webhook", "low"),
        ],
    )
    def test_routes_to_per_channel_priority_queue(self, channel: str, priority: str):
        """Each channel+priority combination routes to notifications.{channel}.{priority}."""
        notification = self._make_notification(channel, priority)
        expected_queue = f"notifications.{channel}.{priority}"

        worker_map = {
            "email": "app.workers.email_worker.send_email",
            "sms": "app.workers.sms_worker.send_sms",
            "webhook": "app.workers.webhook_worker.send_webhook",
        }
        task_path = worker_map[channel]
        mock_task = MagicMock()
        mock_result = MagicMock()
        mock_result.id = "mock-task-id"
        mock_task.apply_async.return_value = mock_result

        with patch(task_path, mock_task):
            _enqueue_channel_task(notification)

        mock_task.apply_async.assert_called_once_with(
            args=[str(notification.id)], queue=expected_queue
        )
        assert notification.celery_task_id == "mock-task-id"

    def test_high_priority_email_not_sent_to_medium_queue(self):
        """High-priority email must NOT go to the medium queue."""
        notification = self._make_notification("email", "high")
        mock_task = MagicMock()
        mock_result = MagicMock()
        mock_result.id = "mock-task-id"
        mock_task.apply_async.return_value = mock_result

        with patch("app.workers.email_worker.send_email", mock_task):
            _enqueue_channel_task(notification)

        _, kwargs = mock_task.apply_async.call_args
        assert kwargs["queue"] == "notifications.email.high"
        assert kwargs["queue"] != "notifications.email.medium"

    @patch("app.modules.delivery.processing.dispatcher.get_sync_session")
    def test_dispatch_event_uses_priority_queues(self, mock_get_session):
        """dispatch_event fans out to per-channel priority queues, not generic channel queues."""
        session = _get_test_session()
        event, notifications = _seed_event_with_notifications(
            session, channels=["email", "sms"], priority="high"
        )
        session.close()

        captured_queues: list[str] = []

        def capture_enqueue(notification, *args, **kwargs):
            captured_queues.append(
                f"notifications.{notification.channel.value}.{notification.priority.value}"
            )

        with patch(
            "app.modules.delivery.processing.dispatcher._enqueue_channel_task",
            side_effect=capture_enqueue,
        ):
            mock_get_session.return_value = _get_test_session()
            result = dispatch_event.apply(args=[str(event.id)]).get()

        assert result["status"] == "dispatched"
        assert set(captured_queues) == {"notifications.email.high", "notifications.sms.high"}
        # Ensure old-style generic queues are never used
        for q in captured_queues:
            assert q not in {"notifications.email", "notifications.sms", "notifications.webhook"}
