"""Platform administration roles and permissions."""

from enum import StrEnum


class AdminRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    SUPPORT = "support"
    AUDITOR = "auditor"


class AdminPermission(StrEnum):
    HEALTH_READ = "platform:health:read"
    ANALYTICS_READ = "platform:analytics:read"
    AUDIT_READ = "platform:audit:read"
    USAGE_READ = "platform:usage:read"
    API_KEYS_READ = "platform:api_keys:read"
    TEMPLATES_MANAGE = "platform:templates:manage"
    ADMINS_MANAGE = "platform:admins:manage"
    SYSTEM_ACCOUNTS_MANAGE = "platform:system_accounts:manage"


class SystemPermission(StrEnum):
    EVENTS_DISPATCH = "system:events:dispatch"
    DELIVERY_PROCESS = "system:delivery:process"
    RECONCILIATION_RUN = "system:reconciliation:run"
    HEALTH_READ = "system:health:read"


_READ_PERMISSIONS = frozenset(
    {
        AdminPermission.HEALTH_READ,
        AdminPermission.ANALYTICS_READ,
        AdminPermission.AUDIT_READ,
        AdminPermission.USAGE_READ,
        AdminPermission.API_KEYS_READ,
    }
)
ROLE_PERMISSIONS: dict[AdminRole, frozenset[AdminPermission]] = {
    AdminRole.AUDITOR: _READ_PERMISSIONS,
    AdminRole.SUPPORT: _READ_PERMISSIONS,
    AdminRole.ADMIN: _READ_PERMISSIONS
    | {AdminPermission.TEMPLATES_MANAGE, AdminPermission.SYSTEM_ACCOUNTS_MANAGE},
    AdminRole.SUPER_ADMIN: frozenset(AdminPermission),
}
