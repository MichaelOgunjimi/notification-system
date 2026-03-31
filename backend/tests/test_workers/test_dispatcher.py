"""Tests for dispatcher — commit-before-enqueue ordering and partial failure."""

import uuid
from unittest.mock import patch

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
from app.utils.datetime import utc_now
from app.workers.dispatcher import dispatch_event

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
) -> tuple[Event, list[Notification]]:
    """Create an event with PENDING notifications for each channel."""
    if channels is None:
        channels = ["email", "sms"]

    api_key = ApiKey(
        id=uuid.uuid4(),
        key_hash="testhash_" + uuid.uuid4().hex,
        key_prefix="test_pref",
        name="dispatch-test-key",
        is_active=True,
        created_at=utc_now(),
    )
    session.add(api_key)
    session.flush()

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

    @patch("app.workers.dispatcher.get_sync_session")
    @patch("app.workers.dispatcher._enqueue_channel_task")
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

    @patch("app.workers.dispatcher.get_sync_session")
    @patch("app.workers.dispatcher._enqueue_channel_task")
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

    @patch("app.workers.dispatcher.get_sync_session")
    @patch("app.workers.dispatcher._enqueue_channel_task")
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

    @patch("app.workers.dispatcher.get_sync_session")
    @patch("app.workers.dispatcher._enqueue_channel_task")
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

    @patch("app.workers.dispatcher.get_sync_session")
    def test_event_not_found(self, mock_get_session):
        mock_get_session.return_value = _get_test_session()
        result = dispatch_event.apply(args=[str(uuid.uuid4())]).get()
        assert result["status"] == "error"
        assert result["reason"] == "event_not_found"

    @patch("app.workers.dispatcher.get_sync_session")
    @patch("app.workers.dispatcher._enqueue_channel_task")
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
