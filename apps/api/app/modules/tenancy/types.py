"""Framework-independent values returned by the tenancy Module interface."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from app.modules.tenancy.authorization import OrganizationCapability
from app.modules.tenancy.models.organization import OrganizationRole


@dataclass(frozen=True, slots=True)
class OrganizationView:
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    role: OrganizationRole
    capabilities: tuple[OrganizationCapability, ...]
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


@dataclass(frozen=True, slots=True)
class ProjectView:
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    created_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
