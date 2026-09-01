"""Organization-wide capabilities and tenant access resolution."""

import enum
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.modules.tenancy.errors import CapabilityDeniedError, TenantResourceNotFoundError
from app.modules.tenancy.models.organization import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from app.modules.tenancy.models.project import Project


class OrganizationCapability(enum.StrEnum):
    READ = "organization:read"
    MANAGE = "organization:manage"
    MANAGE_MEMBERS = "organization:members:manage"
    CREATE_PROJECT = "project:create"
    MANAGE_PROJECT = "project:manage"
    MANAGE_API_KEYS = "api_key:manage"
    READ_PROJECT_USAGE = "project:usage:read"
    READ_PROJECT_AUDIT = "project:audit:read"
    READ_ORGANIZATION_USAGE = "organization:usage:read"
    READ_ORGANIZATION_AUDIT = "organization:audit:read"
    MANAGE_BILLING = "organization:billing:manage"
    DELETE = "organization:delete"


_MEMBER_CAPABILITIES = frozenset(
    {
        OrganizationCapability.READ,
        OrganizationCapability.READ_PROJECT_USAGE,
        OrganizationCapability.READ_PROJECT_AUDIT,
    }
)
_ADMIN_CAPABILITIES = _MEMBER_CAPABILITIES | {
    OrganizationCapability.MANAGE,
    OrganizationCapability.MANAGE_MEMBERS,
    OrganizationCapability.CREATE_PROJECT,
    OrganizationCapability.MANAGE_PROJECT,
    OrganizationCapability.MANAGE_API_KEYS,
    OrganizationCapability.READ_ORGANIZATION_USAGE,
    OrganizationCapability.READ_ORGANIZATION_AUDIT,
}
_ROLE_CAPABILITIES: dict[OrganizationRole, frozenset[OrganizationCapability]] = {
    OrganizationRole.VIEWER: _MEMBER_CAPABILITIES,
    OrganizationRole.MEMBER: _MEMBER_CAPABILITIES,
    OrganizationRole.ADMIN: _ADMIN_CAPABILITIES,
    OrganizationRole.OWNER: _ADMIN_CAPABILITIES
    | {
        OrganizationCapability.MANAGE_BILLING,
        OrganizationCapability.DELETE,
    },
}


@dataclass(frozen=True, slots=True)
class OrganizationAccess:
    organization: Organization
    membership: OrganizationMembership


@dataclass(frozen=True, slots=True)
class ProjectAccess:
    project: Project
    membership: OrganizationMembership


def role_has_capability(
    role: OrganizationRole,
    capability: OrganizationCapability,
) -> bool:
    return capability in _ROLE_CAPABILITIES[role]


def capabilities_for_role(
    role: OrganizationRole,
) -> tuple[OrganizationCapability, ...]:
    """Return the ordered capabilities granted to an organization role.

    Args:
        role: Organization membership role whose effective capabilities are requested.

    Returns:
        The role's capabilities in the stable order defined by
        :class:`OrganizationCapability`.

    Security:
        This function exposes the same policy used by the authorization guards. It
        does not grant access by itself; protected operations must continue to call
        ``authorize_organization`` or ``authorize_project``.
    """
    granted = _ROLE_CAPABILITIES[role]
    return tuple(capability for capability in OrganizationCapability if capability in granted)


async def authorize_organization(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    capability: OrganizationCapability,
) -> OrganizationAccess:
    result = await db.execute(
        select(Organization, OrganizationMembership)
        .join(
            OrganizationMembership,
            col(OrganizationMembership.organization_id) == col(Organization.id),
        )
        .where(
            col(Organization.id) == organization_id,
            col(OrganizationMembership.user_id) == user_id,
        )
    )
    row = result.one_or_none()
    if row is None:
        raise TenantResourceNotFoundError("Organization")

    organization, membership = row
    if not role_has_capability(membership.role, capability):
        raise CapabilityDeniedError
    return OrganizationAccess(organization=organization, membership=membership)


async def authorize_project(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    capability: OrganizationCapability,
    allow_archived: bool = False,
) -> ProjectAccess:
    result = await db.execute(
        select(Project, OrganizationMembership)
        .join(
            OrganizationMembership,
            col(OrganizationMembership.organization_id) == col(Project.organization_id),
        )
        .where(
            col(Project.id) == project_id,
            col(OrganizationMembership.user_id) == user_id,
        )
    )
    row = result.one_or_none()
    if row is None:
        raise TenantResourceNotFoundError("Project")

    project, membership = row
    if project.archived_at is not None and not allow_archived:
        raise TenantResourceNotFoundError("Project")
    if not role_has_capability(membership.role, capability):
        raise CapabilityDeniedError
    return ProjectAccess(project=project, membership=membership)
