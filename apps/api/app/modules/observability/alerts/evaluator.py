"""Periodic evaluation of project alert rules, and of org-wide defaults.

Runs as a Celery beat task (sync, prefork) rather than through the async
analytics service — same reasoning as ``reconciliation.py``: a worker task
uses a plain sync session, not the async API request path. Each metric is
computed directly here rather than by importing the async
``analytics.service.get_analytics``, since that would need an event loop
inside a sync task for one call.

An org-wide rule (``organization_id`` set, ``project_id`` None) is evaluated
independently against every project in its organization, except a project
that already has its own active rule for the same metric — that project's
rule takes precedence, matching how a forked template overrides its system
default. See ``alerts/service.py``'s ``fork_alert_rule``.
"""

import logging
import uuid
from datetime import timedelta

from sqlalchemy import extract, func, select
from sqlmodel import col

from app.core.datetime import utc_now
from app.modules.credentials.model import ApiKey
from app.modules.delivery import notify
from app.modules.delivery.dead_letter.model import DeadLetterMessage
from app.modules.delivery.enums import DeadLetterStatus
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationStatus
from app.modules.notifications.model import Notification
from app.modules.observability.alerts.enums import AlertComparison, AlertMetric
from app.modules.observability.alerts.model import AlertRule, AlertRuleTrigger
from app.modules.tenancy.models.project import Project
from app.workers.celery_app import celery_app
from app.workers.database import get_sync_session

logger = logging.getLogger(__name__)

EVALUATION_BATCH_LIMIT = 200

_METRIC_LABELS = {
    AlertMetric.FAILURE_RATE: "Failure rate",
    AlertMetric.DEAD_LETTER_COUNT: "Dead letters",
    AlertMetric.AVG_LATENCY_MS: "Avg latency",
}


def _format_metric(metric: str, value: float) -> str:
    if metric == AlertMetric.FAILURE_RATE:
        return f"{value:.1f}%"
    if metric == AlertMetric.AVG_LATENCY_MS:
        return f"{round(value)}ms"
    return str(int(value))


def _is_triggered(value: float, rule: AlertRule) -> bool:
    if rule.comparison == AlertComparison.LESS_THAN:
        return value < rule.threshold
    return value > rule.threshold


def _project_key_ids(project_id):
    return select(col(ApiKey.id)).where(col(ApiKey.project_id) == project_id).scalar_subquery()


def _evaluate_metric(
    session, rule: AlertRule, *, project_id: uuid.UUID, window_start, now
) -> float:
    """Compute one rule's metric, for one project, over its trailing window.

    Mirrors the relevant slice of ``analytics.service.get_analytics`` — same
    three metrics Usage already surfaces — but as plain sync queries. Takes
    ``project_id`` separately from ``rule`` since an org-wide rule has no
    ``project_id`` of its own — it's evaluated once per eligible project.
    """
    key_ids = _project_key_ids(project_id)

    if rule.metric == AlertMetric.FAILURE_RATE:
        rows = session.execute(
            select(col(Notification.status), func.count().label("cnt"))
            .join(Event, col(Notification.event_id) == col(Event.id))
            .where(col(Event.api_key_id).in_(key_ids))
            .where(col(Notification.created_at) >= window_start)
            .where(col(Notification.created_at) <= now)
            .group_by(col(Notification.status))
        ).all()
        delivered = next((r.cnt for r in rows if r.status == NotificationStatus.DELIVERED), 0)
        failed = next((r.cnt for r in rows if r.status == NotificationStatus.FAILED), 0)
        total = delivered + failed
        return (failed / total * 100) if total > 0 else 0.0

    if rule.metric == AlertMetric.DEAD_LETTER_COUNT:
        return float(
            session.execute(
                select(func.count())
                .select_from(DeadLetterMessage)
                .join(Notification, col(DeadLetterMessage.notification_id) == col(Notification.id))
                .join(Event, col(Notification.event_id) == col(Event.id))
                .where(col(Event.api_key_id).in_(key_ids))
                .where(col(DeadLetterMessage.status) == DeadLetterStatus.ACTIVE)
                .where(col(DeadLetterMessage.failed_at) >= window_start)
                .where(col(DeadLetterMessage.failed_at) <= now)
            ).scalar()
            or 0
        )

    # AVG_LATENCY_MS
    latency_expr = extract(  # type: ignore[call-overload]
        "epoch", func.age(Notification.delivered_at, Notification.queued_at)
    )
    result = session.execute(
        select(func.avg(latency_expr * 1000))
        .join(Event, col(Notification.event_id) == col(Event.id))
        .where(col(Event.api_key_id).in_(key_ids))
        .where(col(Notification.delivered_at).isnot(None))
        .where(col(Notification.queued_at).isnot(None))
        .where(col(Notification.created_at) >= window_start)
        .where(col(Notification.created_at) <= now)
        .where(latency_expr < 300)
    ).scalar_one_or_none()
    return float(result) if result is not None else 0.0


def _notify(rule: AlertRule, *, project: Project, value: float) -> None:
    if not rule.notify_email:
        return
    notify.alert_triggered(
        recipient=rule.notify_email,
        rule_name=rule.name,
        project_name=project.name,
        metric_label=_METRIC_LABELS[AlertMetric(rule.metric)],
        observed_value=_format_metric(rule.metric, value),
        threshold_value=_format_metric(rule.metric, rule.threshold),
        window_minutes=rule.window_minutes,
    )


def _evaluate_project_rules(session, now) -> tuple[int, int]:
    """Project-owned rules — unchanged single-project evaluation."""
    evaluated = 0
    triggered = 0
    rules = (
        session.execute(
            select(AlertRule)
            .where(col(AlertRule.is_active).is_(True), col(AlertRule.project_id).isnot(None))
            .limit(EVALUATION_BATCH_LIMIT)
        )
        .scalars()
        .all()
    )

    for rule in rules:
        window_start = now - timedelta(minutes=rule.window_minutes)
        # Cooldown: don't re-evaluate (let alone re-fire) a rule that
        # already triggered within its own window — one incident, one email.
        if rule.last_triggered_at is not None and rule.last_triggered_at > window_start:
            continue

        evaluated += 1
        value = _evaluate_metric(
            session, rule, project_id=rule.project_id, window_start=window_start, now=now
        )
        if not _is_triggered(value, rule):
            continue

        # Stamp and commit the cooldown before enqueueing the email, so a
        # retried or slow task can never double-fire the same incident.
        rule.last_triggered_at = now
        session.add(rule)
        session.commit()
        triggered += 1

        project = session.get(Project, rule.project_id)
        if project is not None:
            _notify(rule, project=project, value=value)

    return evaluated, triggered


def _evaluate_org_rules(session, now) -> tuple[int, int]:
    """Org-wide defaults — evaluated once per eligible project in their org."""
    evaluated = 0
    triggered = 0
    org_rules = (
        session.execute(
            select(AlertRule)
            .where(col(AlertRule.is_active).is_(True), col(AlertRule.organization_id).isnot(None))
            .limit(EVALUATION_BATCH_LIMIT)
        )
        .scalars()
        .all()
    )
    if not org_rules:
        return evaluated, triggered

    org_ids = {rule.organization_id for rule in org_rules}
    projects = (
        session.execute(
            select(Project).where(
                col(Project.organization_id).in_(org_ids), col(Project.archived_at).is_(None)
            )
        )
        .scalars()
        .all()
    )
    projects_by_org: dict[uuid.UUID, list[Project]] = {}
    for project in projects:
        projects_by_org.setdefault(project.organization_id, []).append(project)

    # A project with its own active rule for a metric overrides any org-wide
    # default for that same metric — one query up front instead of one per
    # (rule, project) pair.
    project_ids = [project.id for project in projects]
    overridden = {
        (row.project_id, row.metric)
        for row in session.execute(
            select(col(AlertRule.project_id), col(AlertRule.metric)).where(
                col(AlertRule.is_active).is_(True), col(AlertRule.project_id).in_(project_ids)
            )
        ).all()
    }

    for rule in org_rules:
        window_start = now - timedelta(minutes=rule.window_minutes)
        for project in projects_by_org.get(rule.organization_id, []):
            if (project.id, rule.metric) in overridden:
                continue

            trigger = session.execute(
                select(AlertRuleTrigger).where(
                    col(AlertRuleTrigger.rule_id) == rule.id,
                    col(AlertRuleTrigger.project_id) == project.id,
                )
            ).scalar_one_or_none()
            if trigger is not None and trigger.last_triggered_at > window_start:
                continue

            evaluated += 1
            value = _evaluate_metric(
                session, rule, project_id=project.id, window_start=window_start, now=now
            )
            if not _is_triggered(value, rule):
                continue

            if trigger is None:
                trigger = AlertRuleTrigger(rule_id=rule.id, project_id=project.id)
            trigger.last_triggered_at = now
            session.add(trigger)
            session.commit()
            triggered += 1

            _notify(rule, project=project, value=value)

    return evaluated, triggered


def evaluate_alert_rules() -> dict:
    """Evaluate every active project rule, then every active org-wide default."""
    session = get_sync_session()
    try:
        now = utc_now()
        project_evaluated, project_triggered = _evaluate_project_rules(session, now)
        org_evaluated, org_triggered = _evaluate_org_rules(session, now)
    finally:
        session.close()

    return {
        "evaluated": project_evaluated + org_evaluated,
        "triggered": project_triggered + org_triggered,
    }


@celery_app.task(name="alerts.evaluate")
def evaluate_alert_rules_task() -> dict:
    return evaluate_alert_rules()
