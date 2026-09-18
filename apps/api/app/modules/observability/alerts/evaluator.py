"""Periodic evaluation of project alert rules.

Runs as a Celery beat task (sync, prefork) rather than through the async
analytics service — same reasoning as ``reconciliation.py``: a worker task
uses a plain sync session, not the async API request path. Each metric is
computed directly here rather than by importing the async
``analytics.service.get_analytics``, since that would need an event loop
inside a sync task for one call.
"""

import logging
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
from app.modules.observability.alerts.enums import AlertMetric
from app.modules.observability.alerts.model import AlertRule
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


def _project_key_ids(project_id):
    return select(col(ApiKey.id)).where(col(ApiKey.project_id) == project_id).scalar_subquery()


def _evaluate_metric(session, rule: AlertRule, *, window_start, now) -> float:
    """Compute one rule's metric over its trailing window.

    Mirrors the relevant slice of ``analytics.service.get_analytics`` — same
    three metrics Usage already surfaces — but as plain sync queries.
    """
    key_ids = _project_key_ids(rule.project_id)

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


def evaluate_alert_rules() -> dict:
    """Evaluate every active rule, notifying and cooling down any that fired."""
    session = get_sync_session()
    evaluated = 0
    triggered = 0
    try:
        now = utc_now()
        rules = (
            session.execute(
                select(AlertRule)
                .where(col(AlertRule.is_active).is_(True))
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
            value = _evaluate_metric(session, rule, window_start=window_start, now=now)
            if value <= rule.threshold:
                continue

            # Stamp and commit the cooldown before enqueueing the email, so a
            # retried or slow task can never double-fire the same incident.
            rule.last_triggered_at = now
            session.add(rule)
            session.commit()
            triggered += 1

            if rule.notify_email:
                project = session.get(Project, rule.project_id)
                if project is not None:
                    notify.alert_triggered(
                        recipient=rule.notify_email,
                        rule_name=rule.name,
                        project_name=project.name,
                        metric_label=_METRIC_LABELS[AlertMetric(rule.metric)],
                        observed_value=_format_metric(rule.metric, value),
                        threshold_value=_format_metric(rule.metric, rule.threshold),
                        window_minutes=rule.window_minutes,
                    )
    finally:
        session.close()

    return {"evaluated": evaluated, "triggered": triggered}


@celery_app.task(name="alerts.evaluate")
def evaluate_alert_rules_task() -> dict:
    return evaluate_alert_rules()
