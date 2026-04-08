"""Tests for reconciliation sweep worker."""

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from pydantic import PostgresDsn
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool
from sqlmodel import col

import app.models  # noqa: F401
from app.core.config import settings
from app.models.api_key import ApiKey
from app.models.dead_letter import DeadLetterMessage
from app.models.enums import EventStatus, NotificationChannel, NotificationStatus
from app.models.event import Event
from app.models.notification import Notification
from app.models.retry_policy import RetryPolicy
from app.utils.datetime import utc_now
from app.workers.reconciliation import reconcile_stuck_notifications

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
    *,
    status: NotificationStatus = NotificationStatus.QUEUED,
    channel: str = "email",
    retry_count: int = 0,
    next_retry_at=None,
    updated_at=None,
) -> tuple[Event, Notification]:
    """Insert a minimal api_key + event + notification into the test DB."""
    now = utc_now()
    api_key = ApiKey(
        id=uuid.uuid4(),
        key_hash="testhash_" + uuid.uuid4().hex,
        key_prefix="test_pref",
        name="reconciliation-test-key",
        is_active=True,
        created_at=now,
    )
    session.add(api_key)
    session.flush()

    event = Event(
        id=uuid.uuid4(),
        event_type="test.reconciliation",
        payload={"msg": "hello"},
        status=EventStatus.PROCESSING,
        api_key_id=api_key.id,
        created_at=now,
        updated_at=now,
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
        next_retry_at=next_retry_at,
        created_at=now,
        updated_at=updated_at or now,
    )
    session.add(notification)
    session.commit()
    return event, notification


def _seed_retry_policy(
    session: Session,
    *,
    channel: NotificationChannel = NotificationChannel.EMAIL,
    max_retries: int = 3,
    base_delay_seconds: int = 10,
    max_backoff_seconds: int = 600,
    jitter_enabled: bool = False,
    retry_on_timeout: bool = True,
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
        retry_on_5xx=True,
        retry_on_4xx=False,
    )
    session.add(policy)
    session.commit()
    return policy


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_missed_retry_re_enqueued(mock_get_session, mock_send_task):
    session = _get_test_session()
    _event, notification = _seed_event_and_notification(
        session,
        status=NotificationStatus.QUEUED,
        channel="email",
        next_retry_at=utc_now() - timedelta(minutes=1),
    )
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()

    assert result["status"] == "ok"
    assert result["recovered_missed_retries"] == 1
    mock_send_task.assert_called_once_with(
        "app.workers.email_worker.send_email",
        args=[str(notification.id)],
        queue="notifications.email.medium",
    )


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_future_retry_not_touched(mock_get_session, mock_send_task):
    session = _get_test_session()
    _seed_event_and_notification(
        session,
        status=NotificationStatus.QUEUED,
        channel="email",
        next_retry_at=utc_now() + timedelta(minutes=5),
    )
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()

    assert result["status"] == "ok"
    assert result["recovered_missed_retries"] == 0
    mock_send_task.assert_not_called()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_zombie_processing_with_policy_retries(mock_get_session, mock_send_task):
    session = _get_test_session()
    _event, notification = _seed_event_and_notification(
        session,
        status=NotificationStatus.PROCESSING,
        channel="email",
        retry_count=0,
        updated_at=utc_now() - timedelta(minutes=10),
    )
    _seed_retry_policy(session, channel=NotificationChannel.EMAIL, jitter_enabled=False)
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()

    assert result["status"] == "ok"
    assert result["recovered_zombies"] == 1
    assert mock_send_task.call_count == 1
    assert mock_send_task.call_args.args == ("app.workers.email_worker.send_email",)
    assert mock_send_task.call_args.kwargs["args"] == [str(notification.id)]
    assert mock_send_task.call_args.kwargs["countdown"] == 10.0
    assert mock_send_task.call_args.kwargs["queue"] == "notifications.email.medium"

    verify = _get_test_session()
    refreshed = verify.get(Notification, notification.id)
    assert refreshed.status == NotificationStatus.QUEUED
    assert refreshed.retry_count == 1
    assert refreshed.next_retry_at is not None
    verify.close()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_zombie_processing_exhausted_to_dlq(mock_get_session, mock_send_task):
    session = _get_test_session()
    _event, notification = _seed_event_and_notification(
        session,
        status=NotificationStatus.PROCESSING,
        channel="email",
        retry_count=3,
        updated_at=utc_now() - timedelta(minutes=10),
    )
    _seed_retry_policy(session, channel=NotificationChannel.EMAIL, max_retries=3)
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()

    assert result["status"] == "ok"
    assert result["recovered_zombies"] == 1
    mock_send_task.assert_not_called()

    verify = _get_test_session()
    refreshed = verify.get(Notification, notification.id)
    assert refreshed.status == NotificationStatus.DEAD_LETTER
    assert refreshed.error_message == "Recovered by reconciliation: worker timeout"

    dlq_message = verify.execute(
        select(DeadLetterMessage).where(col(DeadLetterMessage.notification_id) == notification.id)
    ).scalar_one_or_none()
    assert dlq_message is not None
    assert dlq_message.error_type == "worker_timeout"
    assert dlq_message.error_message == "Recovered by reconciliation: worker timeout"
    verify.close()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_zombie_processing_no_policy_fails(mock_get_session, mock_send_task):
    session = _get_test_session()
    _event, notification = _seed_event_and_notification(
        session,
        status=NotificationStatus.PROCESSING,
        channel="email",
        updated_at=utc_now() - timedelta(minutes=10),
    )
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()

    assert result["status"] == "ok"
    assert result["recovered_zombies"] == 1
    mock_send_task.assert_not_called()

    verify = _get_test_session()
    refreshed = verify.get(Notification, notification.id)
    assert refreshed.status == NotificationStatus.FAILED
    assert refreshed.error_message == "Recovered by reconciliation: worker timeout"
    assert refreshed.failed_at is not None
    verify.close()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_recent_processing_not_touched(mock_get_session, mock_send_task):
    session = _get_test_session()
    _event, notification = _seed_event_and_notification(
        session,
        status=NotificationStatus.PROCESSING,
        channel="email",
        updated_at=utc_now() - timedelta(minutes=2),
    )
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()

    assert result["status"] == "ok"
    assert result["recovered_zombies"] == 0
    mock_send_task.assert_not_called()

    verify = _get_test_session()
    refreshed = verify.get(Notification, notification.id)
    assert refreshed.status == NotificationStatus.PROCESSING
    verify.close()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_terminal_statuses_ignored(mock_get_session, mock_send_task):
    session = _get_test_session()
    statuses = [
        NotificationStatus.DELIVERED,
        NotificationStatus.FAILED,
        NotificationStatus.DEAD_LETTER,
        NotificationStatus.CANCELLED,
    ]
    seeded_ids: list[uuid.UUID] = []
    for status in statuses:
        _event, notification = _seed_event_and_notification(
            session,
            status=status,
            channel="email",
            next_retry_at=utc_now() - timedelta(minutes=1),
            updated_at=utc_now() - timedelta(minutes=10),
        )
        seeded_ids.append(notification.id)
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()

    assert result["status"] == "ok"
    assert result["recovered_missed_retries"] == 0
    assert result["recovered_zombies"] == 0
    mock_send_task.assert_not_called()

    verify = _get_test_session()
    for idx, status in enumerate(statuses):
        refreshed = verify.get(Notification, seeded_ids[idx])
        assert refreshed.status == status
    verify.close()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_empty_run_no_errors(mock_get_session, mock_send_task):
    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()

    assert result["status"] == "ok"
    assert result["recovered_missed_retries"] == 0
    assert result["recovered_zombies"] == 0
    mock_send_task.assert_not_called()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_missed_retry_clears_next_retry_at(mock_get_session, mock_send_task):
    """After re-enqueue, next_retry_at must be cleared so the next sweep skips it."""
    session = _get_test_session()
    _event, notification = _seed_event_and_notification(
        session,
        status=NotificationStatus.QUEUED,
        channel="email",
        next_retry_at=utc_now() - timedelta(minutes=1),
    )
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = reconcile_stuck_notifications.apply().get()
    assert result["recovered_missed_retries"] == 1

    verify = _get_test_session()
    refreshed = verify.get(Notification, notification.id)
    assert refreshed.next_retry_at is None, "next_retry_at must be cleared after re-enqueue"
    assert refreshed.status == NotificationStatus.QUEUED
    verify.close()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_second_sweep_does_not_re_enqueue(mock_get_session, mock_send_task):
    """Verify a cleared notification is NOT picked up by a subsequent sweep."""
    session = _get_test_session()
    _event, notification = _seed_event_and_notification(
        session,
        status=NotificationStatus.QUEUED,
        channel="email",
        next_retry_at=utc_now() - timedelta(minutes=1),
    )
    session.close()

    # First sweep
    mock_get_session.return_value = _get_test_session()
    result1 = reconcile_stuck_notifications.apply().get()
    assert result1["recovered_missed_retries"] == 1

    # Second sweep — same notification should NOT be re-enqueued
    mock_send_task.reset_mock()
    mock_get_session.return_value = _get_test_session()
    result2 = reconcile_stuck_notifications.apply().get()
    assert result2["recovered_missed_retries"] == 0
    mock_send_task.assert_not_called()


@patch("app.workers.reconciliation.celery_app.send_task")
@patch("app.workers.reconciliation.get_sync_session")
def test_sweep_batch_limit_respected(mock_get_session, mock_send_task):
    """Sweep processes at most SWEEP_BATCH_LIMIT notifications per run."""
    session = _get_test_session()
    batch_size = 3  # use small number to test limiting
    for _ in range(batch_size + 2):
        _seed_event_and_notification(
            session,
            status=NotificationStatus.QUEUED,
            channel="email",
            next_retry_at=utc_now() - timedelta(minutes=1),
        )
    session.close()

    # Temporarily patch the batch limit to a small value
    with patch("app.workers.reconciliation.SWEEP_BATCH_LIMIT", batch_size):
        mock_get_session.return_value = _get_test_session()
        result = reconcile_stuck_notifications.apply().get()
        assert result["recovered_missed_retries"] == batch_size
        assert mock_send_task.call_count == batch_size
