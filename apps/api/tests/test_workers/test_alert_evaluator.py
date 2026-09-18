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
from app.modules.credentials.model import ApiKey
from app.modules.events.enums import EventStatus
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.notifications.model import Notification
from app.modules.observability.alerts.evaluator import evaluate_alert_rules_task
from app.modules.observability.alerts.model import AlertRule, AlertRuleTrigger
from app.modules.tenancy.models.project import Project
from tests.helpers import create_sync_project_api_key, create_sync_project_in_org

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
                "TRUNCATE alert_rules, alert_rule_triggers, notifications, events, api_keys CASCADE"
            )
        )
        conn.commit()


def _get_test_session() -> Session:
    return SyncTestSession()


def _seed_notifications_for_key(
    session: Session, api_key: ApiKey, *, delivered: int, failed: int
) -> None:
    """One event per notification, split delivered/failed, for an existing api key."""
    now = utc_now()
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


def _seed_project_with_notifications(session: Session, *, delivered: int, failed: int) -> uuid.UUID:
    """Insert an api key + one event per notification, split delivered/failed."""
    api_key = create_sync_project_api_key(session, name=f"alert-eval-{uuid.uuid4().hex[:8]}")
    _seed_notifications_for_key(session, api_key, delivered=delivered, failed=failed)
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


def _seed_org_rule(
    session: Session, *, organization_id: uuid.UUID, threshold: float, **overrides
) -> uuid.UUID:
    rule = AlertRule(
        organization_id=organization_id,
        name="Org-wide high failure rate",
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
def test_less_than_comparison_triggers_below_threshold(mock_get_session, mock_notify):
    session = _get_test_session()
    project_id = _seed_project_with_notifications(session, delivered=9, failed=1)  # 10% failure
    _seed_rule(session, project_id=project_id, threshold=50.0, comparison="lt")
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = evaluate_alert_rules_task.apply().get()

    # 10% failure is below the 50% threshold, so an "lt" rule fires here
    # where a default "gt" rule (the other tests) would not.
    assert result == {"evaluated": 1, "triggered": 1}
    mock_notify.assert_called_once()


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


@patch("app.modules.observability.alerts.evaluator.notify.alert_triggered")
@patch("app.modules.observability.alerts.evaluator.get_sync_session")
def test_org_wide_rule_triggers_for_project_without_override(mock_get_session, mock_notify):
    session = _get_test_session()
    api_key = create_sync_project_api_key(session, name="org-eval")
    _seed_notifications_for_key(session, api_key, delivered=1, failed=9)  # 90% failure
    project = session.get(Project, api_key.project_id)
    _seed_org_rule(session, organization_id=project.organization_id, threshold=50.0)
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = evaluate_alert_rules_task.apply().get()

    assert result == {"evaluated": 1, "triggered": 1}
    mock_notify.assert_called_once()
    assert mock_notify.call_args.kwargs["project_name"] == project.name


@patch("app.modules.observability.alerts.evaluator.notify.alert_triggered")
@patch("app.modules.observability.alerts.evaluator.get_sync_session")
def test_org_wide_rule_is_skipped_for_project_with_its_own_rule(mock_get_session, mock_notify):
    session = _get_test_session()
    overridden_key = create_sync_project_api_key(session, name="overridden")
    overridden_project = session.get(Project, overridden_key.project_id)
    _seed_notifications_for_key(session, overridden_key, delivered=1, failed=9)  # 90% failure
    # A project-owned rule for the same metric wins, even though it never
    # fires itself — its mere existence overrides the org-wide default.
    _seed_rule(session, project_id=overridden_project.id, threshold=99.9)

    plain_key = create_sync_project_in_org(
        session,
        organization_id=overridden_project.organization_id,
        created_by_user_id=overridden_project.created_by_user_id,
        name="plain",
    )
    _seed_notifications_for_key(session, plain_key, delivered=1, failed=9)  # 90% failure

    _seed_org_rule(session, organization_id=overridden_project.organization_id, threshold=50.0)
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = evaluate_alert_rules_task.apply().get()

    # evaluated=2: the overridden project's own rule (pass 1, doesn't fire at
    # its 99.9 threshold) plus the plain project's org-wide check (pass 2).
    # The overridden project is never evaluated against the org-wide default —
    # skipped before a metric is even computed for it there.
    assert result == {"evaluated": 2, "triggered": 1}
    mock_notify.assert_called_once()
    assert mock_notify.call_args.kwargs["project_name"] == "plain"


@patch("app.modules.observability.alerts.evaluator.notify.alert_triggered")
@patch("app.modules.observability.alerts.evaluator.get_sync_session")
def test_org_wide_rule_cooldown_is_tracked_per_project(mock_get_session, mock_notify):
    session = _get_test_session()
    api_key = create_sync_project_api_key(session, name="org-cooldown")
    _seed_notifications_for_key(session, api_key, delivered=0, failed=10)  # 100% failure
    project = session.get(Project, api_key.project_id)
    rule_id = _seed_org_rule(session, organization_id=project.organization_id, threshold=50.0)
    session.add(
        AlertRuleTrigger(
            rule_id=rule_id,
            project_id=project.id,
            last_triggered_at=utc_now() - timedelta(minutes=5),
        )
    )
    session.commit()
    session.close()

    mock_get_session.return_value = _get_test_session()
    result = evaluate_alert_rules_task.apply().get()

    # A trigger row 5 minutes old is inside the rule's 60-minute window, so
    # this project's org-wide evaluation is skipped — same cooldown contract
    # as a project-owned rule's scalar last_triggered_at.
    assert result == {"evaluated": 0, "triggered": 0}
    mock_notify.assert_not_called()
