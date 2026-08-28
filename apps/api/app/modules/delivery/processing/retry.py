"""Retry logic — exponential backoff, eligibility checks, dead letter queue.

This module is the brain of the retry system. It's called by channel_base.py
when a delivery attempt fails. The flow is:

  1. should_retry() — check if the error is retryable per the channel's policy
  2. schedule_retry() — increment counter, calculate backoff, set QUEUED
  3. (caller re-enqueues to Celery with countdown)

If retries are exhausted, move_to_dead_letter() archives the notification
for manual inspection or replay.

Backoff formula: min(base_delay * 2^retry_count, max_backoff) ± jitter
Example with base=10s, max=600s:
  Attempt 1: ~10s, Attempt 2: ~20s, Attempt 3: ~40s, ... Attempt 7: ~600s (capped)
"""

import logging
import random
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlmodel import col

from app.core.datetime import utc_now
from app.modules.delivery.dead_letter.model import DeadLetterMessage
from app.modules.delivery.settings.retry_model import RetryPolicy
from app.modules.notifications.enums import NotificationStatus
from app.modules.notifications.log_model import NotificationLog
from app.modules.notifications.model import Notification

logger = logging.getLogger(__name__)

# Error types that should never be retried regardless of policy
_PERMANENT_ERRORS = frozenset({"permanent_failure", "provider_not_configured"})


def calculate_backoff(
    retry_count: int,
    base_delay: int,
    max_backoff: int,
    jitter: bool = True,
) -> float:
    """Exponential backoff with optional jitter.

    Jitter spreads retries to avoid thundering herd when a provider recovers.

    Args:
        retry_count: Current retry attempt number (0-indexed).
        base_delay: Initial backoff delay in seconds.
        max_backoff: Maximum backoff delay in seconds (ceiling).
        jitter: If True, randomize delay between 50%-150% of calculated value.

    Returns:
        Delay in seconds: min(base * 2^count, max) * jitter_factor.
    """
    delay = min(base_delay * (2**retry_count), max_backoff)
    if jitter:
        # Randomize between 50% and 150% of calculated delay
        delay = delay * (0.5 + random.random())
    return float(delay)


def load_retry_policy(session: Session, channel: str) -> RetryPolicy | None:
    """Load the retry policy for a channel, or None if not configured.

    Args:
        session: SQLAlchemy database session.
        channel: Channel name ("email", "sms", "webhook").

    Returns:
        RetryPolicy object if configured, None otherwise.
    """
    return session.execute(
        select(RetryPolicy).where(col(RetryPolicy.channel) == channel)
    ).scalar_one_or_none()


def should_retry(
    notification: Notification,
    policy: RetryPolicy,
    error_type: str | None,
) -> bool:
    """Decide if a failed notification should be retried.

    Checks: retry count vs max, permanent errors, and per-policy error rules.

    Args:
        notification: The notification object with current retry_count.
        policy: The retry policy for the channel.
        error_type: Type of delivery error ("timeout", "server_error", "permanent_failure", etc.).

    Returns:
        True if the notification should be retried, False otherwise.
    """
    if notification.retry_count >= policy.max_retries:
        return False

    if error_type in _PERMANENT_ERRORS:
        return False

    if error_type == "timeout" and not policy.retry_on_timeout:
        return False
    if error_type == "server_error" and not policy.retry_on_5xx:
        return False
    if error_type == "client_error" and not policy.retry_on_4xx:
        return False

    return True


def schedule_retry(
    session: Session,
    notification: Notification,
    policy: RetryPolicy,
    error_message: str | None,
    error_type: str | None,
) -> float:
    """Prepare a notification for retry.

    Updates DB state (PROCESSING → QUEUED, increments retry_count, sets
    next_retry_at). The caller is responsible for re-enqueuing to Celery.

    Args:
        session: SQLAlchemy database session.
        notification: The notification to schedule for retry.
        policy: The retry policy defining backoff and limits.
        error_message: Description of the delivery failure.
        error_type: Classification of the error for policy matching.

    Returns:
        Countdown in seconds before the retry should be enqueued.
    """
    countdown = calculate_backoff(
        notification.retry_count,
        policy.base_delay_seconds,
        policy.max_backoff_seconds,
        policy.jitter_enabled,
    )

    now = utc_now()
    notification.retry_count += 1
    notification.next_retry_at = now + timedelta(seconds=countdown)
    notification.status = NotificationStatus.QUEUED
    notification.error_message = error_message
    notification.updated_at = now

    session.add(
        NotificationLog(
            notification_id=notification.id,
            previous_status=NotificationStatus.PROCESSING,
            new_status=NotificationStatus.QUEUED,
            error_message=f"Retry {notification.retry_count}/{policy.max_retries}: {error_message}",
            metadata_={
                "retry_count": notification.retry_count,
                "countdown_seconds": round(countdown, 1),
                "error_type": error_type,
            },
        )
    )

    logger.info(
        "Scheduling retry %d/%d for notification %s in %.1fs",
        notification.retry_count,
        policy.max_retries,
        notification.id,
        countdown,
    )
    return countdown


def _build_retry_history(session: Session, notification_id: object) -> list[dict]:
    """Build retry history from notification logs for DLQ archival.

    Args:
        session: SQLAlchemy database session.
        notification_id: UUID of the notification to extract history for.

    Returns:
        List of dicts with keys: attempt, error_type, error_message, timestamp.
    """
    logs = (
        session.execute(
            select(NotificationLog)
            .where(
                col(NotificationLog.notification_id) == notification_id,
                col(NotificationLog.new_status) == NotificationStatus.QUEUED,
                NotificationLog.metadata_.isnot(None),  # type: ignore[union-attr]
            )
            .order_by(col(NotificationLog.created_at))
        )
        .scalars()
        .all()
    )
    return [
        {
            "attempt": log.metadata_.get("retry_count", 0) if log.metadata_ else 0,  # type: ignore[union-attr]
            "error_type": log.metadata_.get("error_type") if log.metadata_ else None,  # type: ignore[union-attr]
            "error_message": log.error_message,
            "timestamp": log.created_at.isoformat(),
        }
        for log in logs
    ]


def move_to_dead_letter(
    session: Session,
    notification: Notification,
    event_payload: dict,
    error_message: str | None,
    error_type: str | None,
) -> DeadLetterMessage:
    """Move a notification to the dead letter queue after exhausting retries.

    Creates a DeadLetterMessage record with retry history, updates notification
    status to DEAD_LETTER, and logs the transition.

    Args:
        session: SQLAlchemy database session.
        notification: The notification that exhausted retries.
        event_payload: Original event payload for context.
        error_message: Final error message from delivery attempt.
        error_type: Classification of the error that caused DLQ move.

    Returns:
        The DeadLetterMessage record created for the notification.
    """
    now = utc_now()

    notification.status = NotificationStatus.DEAD_LETTER
    notification.error_message = error_message
    notification.failed_at = now
    notification.updated_at = now

    retry_history = _build_retry_history(session, notification.id)

    dlq_message = DeadLetterMessage(
        notification_id=notification.id,
        channel=notification.channel,
        recipient_address=notification.recipient_address,
        event_payload=event_payload,
        error_type=error_type or "unknown",
        error_message=error_message or "Unknown error",
        retry_count=notification.retry_count,
        retry_history=retry_history,
        failed_at=now,
    )
    session.add(dlq_message)

    session.add(
        NotificationLog(
            notification_id=notification.id,
            previous_status=NotificationStatus.PROCESSING,
            new_status=NotificationStatus.DEAD_LETTER,
            error_message=(f"Exhausted {notification.retry_count} retries: {error_message}"),
            metadata_={
                "retry_count": notification.retry_count,
                "error_type": error_type,
            },
        )
    )

    logger.warning(
        "Notification %s moved to dead letter queue after %d retries",
        notification.id,
        notification.retry_count,
    )
    return dlq_message
