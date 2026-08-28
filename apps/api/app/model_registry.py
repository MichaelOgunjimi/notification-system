"""SQLModel table registry used by Alembic and test setup.

Importing this module ensures Alembic autogenerate discovers every table.
"""

from app.modules.admin.system_accounts.model import SystemAccount, SystemCredential
from app.modules.admin.users.model import AdminUser
from app.modules.credentials.model import ApiKey
from app.modules.delivery.dead_letter.model import DeadLetterMessage
from app.modules.delivery.enums import DeadLetterStatus
from app.modules.delivery.settings.channel_model import ChannelConfig
from app.modules.delivery.settings.retry_model import RetryPolicy
from app.modules.events.enums import EventPriority, EventStatus
from app.modules.events.model import Event
from app.modules.events.scheduled.model import ScheduledEvent
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.oauth_account import OAuthAccount
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.notifications.log_model import NotificationLog
from app.modules.notifications.model import Notification
from app.modules.observability.alerts.model import AlertRule
from app.modules.observability.audit.model import AuditLog
from app.modules.observability.usage.model import ApiKeyUsage
from app.modules.suppressions.enums import SuppressionReason, SuppressionSource
from app.modules.suppressions.model import Suppression
from app.modules.templates.model import Template
from app.modules.tenancy.invitations.model import OrganizationInvitation
from app.modules.tenancy.models.organization import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from app.modules.tenancy.models.project import Project

__all__ = [
    "ApiKey",
    "ApiKeyUsage",
    "AlertRule",
    "AuditLog",
    "AdminUser",
    "ChannelConfig",
    "DeadLetterMessage",
    "DeadLetterStatus",
    "EmailAddress",
    "Event",
    "EventPriority",
    "EventStatus",
    "Notification",
    "NotificationChannel",
    "NotificationLog",
    "NotificationStatus",
    "Organization",
    "OrganizationInvitation",
    "OrganizationMembership",
    "OrganizationRole",
    "OAuthAccount",
    "Project",
    "RefreshToken",
    "RetryPolicy",
    "ScheduledEvent",
    "Suppression",
    "SuppressionReason",
    "SuppressionSource",
    "SystemAccount",
    "SystemCredential",
    "Template",
    "User",
]
