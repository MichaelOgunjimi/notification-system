"""Models package — re-exports all SQLModel table models.

Importing this module ensures Alembic autogenerate discovers every table.
"""

from app.models.alert_rule import AlertRule
from app.models.api_key import ApiKey
from app.models.audit_log import AuditLog
from app.models.channel_config import ChannelConfig
from app.models.dead_letter import DeadLetterMessage
from app.models.enums import (
    DeadLetterStatus,
    EventPriority,
    EventStatus,
    NotificationChannel,
    NotificationStatus,
    SuppressionReason,
    SuppressionSource,
)
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.models.retry_policy import RetryPolicy
from app.models.scheduled_event import ScheduledEvent
from app.models.suppression import Suppression
from app.models.template import Template
from app.models.usage import ApiKeyUsage

__all__ = [
    "ApiKey",
    "ApiKeyUsage",
    "AlertRule",
    "AuditLog",
    "ChannelConfig",
    "DeadLetterMessage",
    "DeadLetterStatus",
    "Event",
    "EventPriority",
    "EventStatus",
    "Notification",
    "NotificationChannel",
    "NotificationLog",
    "NotificationStatus",
    "RetryPolicy",
    "ScheduledEvent",
    "Suppression",
    "SuppressionReason",
    "SuppressionSource",
    "Template",
]
