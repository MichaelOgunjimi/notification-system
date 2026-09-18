"""Tests for the alert rule evaluator worker."""

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from pydantic import PostgresDsn
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

import app.model_registry  # noqa: F401
from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.events.enums import EventStatus
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.notifications.model import Notification
from app.modules.observability.alerts.evaluator import evaluate_alert_rules_task
from app.modules.observability.alerts.model import AlertRule
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
        conn.execute(text("TRUNCATE alert_rules, notifications, events, api_keys CASCADE"))
        conn.commit()


def _get_test_session() -> Session:
    return SyncTestSession()


def _seed_project_with_notifications(session: Session, *, delivered: int, failed: int) -> uuid.UUID:
    """Insert an api key + one event per notification, split delivered/failed."""
    now = utc_now()
    api_key = create_sync_project_api_key(session, name=f"alert-eval-{uuid.uuid4().hex[:8]}")

    for status in [NotificationStatus.DELIVERED] * delivered + [NotificationStatus.FAILED] * failed:
        event = Event(
            id=uuid.uuid4(),
            event_type="test.alert_eval",
            payload={},
            status=EventStatus.COMPLETED,
            api_key_id=api_key.id,
            created_at=now,
            updated_at=now,
        )
        session.add(event)
        session.flush()
        session.add(
            Notification(
                id=uuid.uuid4(),
                event_id=event.id,
                channel=NotificationChannel.EMAIL,
                recipient_user_id="u1",
                recipient_address="u1@test.com",
                status=status,
                created_at=now,
                updated_at=now,
            )
        )
    session.commit()
    return api_key.project_id


def _seed_rule(
    session: Session, *, project_id: uuid.UUID, threshold: float, **overrides
) -> uuid.UUID:
    rule = AlertRule(
        project_id=project_id,
        name="High failure rate",
        metric="failure_rate",
        threshold=threshold,
        window_minutes=60,
        notify_email="oncall@example.com",
        is_active=True,
        **overrides,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return rule.id


@patch("app.modules.observability.alerts.evaluator.notify.alert_triggered")
@patch("app.modules.observability.alerts.evaluator.get_sync_session")
def test_rule_above_threshold_triggers_and_notifies(mock_get_session, mock_notify):
    session = _get_test_session()
    project_id = _seed_project_with_notifications(session, delivered=1, failed=9)  # 90% failure
    rule_id = _seed_rule(session, project_id=project_id, threshold=50.0)
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = evaluate_alert_rules_task.apply().get()

    assert result == {"evaluated": 1, "triggered": 1}
    mock_notify.assert_called_once()
    assert mock_notify.call_args.kwargs["recipient"] == "oncall@example.com"
    assert mock_notify.call_args.kwargs["observed_value"] == "90.0%"

    verify_session = _get_test_session()
    rule = verify_session.get(AlertRule, rule_id)
    assert rule.last_triggered_at is not None
    verify_session.close()


@patch("app.modules.observability.alerts.evaluator.notify.alert_triggered")
@patch("app.modules.observability.alerts.evaluator.get_sync_session")
def test_rule_below_threshold_does_not_trigger(mock_get_session, mock_notify):
    session = _get_test_session()
    project_id = _seed_project_with_notifications(session, delivered=9, failed=1)  # 10% failure
    _seed_rule(session, project_id=project_id, threshold=50.0)
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = evaluate_alert_rules_task.apply().get()

    assert result == {"evaluated": 1, "triggered": 0}
    mock_notify.assert_not_called()


@patch("app.modules.observability.alerts.evaluator.notify.alert_triggered")
@patch("app.modules.observability.alerts.evaluator.get_sync_session")
def test_cooldown_prevents_a_second_fire_within_the_window(mock_get_session, mock_notify):
    session = _get_test_session()
    project_id = _seed_project_with_notifications(session, delivered=0, failed=10)  # 100% failure
    _seed_rule(
        session,
        project_id=project_id,
        threshold=50.0,
        last_triggered_at=utc_now() - timedelta(minutes=5),
    )
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = evaluate_alert_rules_task.apply().get()

    # last_triggered_at (5 min ago) is inside the 60-minute window, so the
    # rule is skipped entirely — not re-evaluated, and definitely not re-fired.
    assert result == {"evaluated": 0, "triggered": 0}
    mock_notify.assert_not_called()
