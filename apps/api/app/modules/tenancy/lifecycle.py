"""Low-level organization and project persistence operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.user import User
from app.modules.tenancy.models.organization import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from app.modules.tenancy.models.project import Project


async def create_organization(
    db: AsyncSession,
    *,
    owner: User,
    name: str,
    slug: str,
    description: str | None = None,
) -> Organization:
    organization = Organization(
        name=name,
        slug=slug,
        description=description,
        created_by_user_id=owner.id,
    )
    db.add(organization)
    await db.flush()
    db.add(
        OrganizationMembership(
            organization_id=organization.id,
            user_id=owner.id,
            role=OrganizationRole.OWNER,
        )
    )
    await db.flush()
    await db.refresh(organization)
    return organization


async def create_project(
    db: AsyncSession,
    *,
    organization: Organization,
    creator: User,
    name: str,
    slug: str,
    description: str | None = None,
) -> Project:
    project = Project(
        organization_id=organization.id,
        name=name,
        slug=slug,
        description=description,
        created_by_user_id=creator.id,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project
