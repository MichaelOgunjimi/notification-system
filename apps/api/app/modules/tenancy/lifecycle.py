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


async def create_organization_with_project(
    db: AsyncSession,
    *,
    owner: User,
    name: str,
    slug: str,
    description: str | None = None,
    project_name: str = "Default",
    project_slug: str = "default",
) -> Organization:
    """Create an organization and its first project in one step.

    The dashboard is always scoped to a project, so every organization is born
    with one. First sign-in provisioning uses the defaults; explicit creation
    passes the project the user named.
    """
    organization = await create_organization(
        db,
        owner=owner,
        name=name,
        slug=slug,
        description=description,
    )
    await create_project(
        db,
        organization=organization,
        creator=owner,
        name=project_name,
        slug=project_slug,
    )
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
