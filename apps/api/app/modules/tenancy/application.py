"""Organization and project use cases exposed by the tenancy Module."""

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.datetime import utc_now
from app.modules.identity.models.user import User
from app.modules.observability.audit.service import log_action
from app.modules.tenancy.authorization import (
    OrganizationCapability,
    authorize_organization,
    authorize_project,
    capabilities_for_role,
)
from app.modules.tenancy.errors import SlugConflictError
from app.modules.tenancy.lifecycle import (
    create_organization_with_project,
    create_project,
)
from app.modules.tenancy.models.organization import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from app.modules.tenancy.models.project import Project
from app.modules.tenancy.types import OrganizationView, ProjectView


def _organization_view(
    organization: Organization,
    role: OrganizationRole,
) -> OrganizationView:
    return OrganizationView(
        id=organization.id,
        name=organization.name,
        slug=organization.slug,
        description=organization.description,
        role=role,
        capabilities=capabilities_for_role(role),
        created_at=organization.created_at,
        updated_at=organization.updated_at,
        archived_at=organization.archived_at,
    )


def _project_view(project: Project) -> ProjectView:
    return ProjectView(
        id=project.id,
        organization_id=project.organization_id,
        name=project.name,
        slug=project.slug,
        description=project.description,
        created_by_user_id=project.created_by_user_id,
        created_at=project.created_at,
        updated_at=project.updated_at,
        archived_at=project.archived_at,
    )


async def list_organizations_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    include_archived: bool = False,
) -> list[OrganizationView]:
    statement = (
        select(Organization, OrganizationMembership)
        .join(
            OrganizationMembership,
            col(OrganizationMembership.organization_id) == col(Organization.id),
        )
        .where(col(OrganizationMembership.user_id) == user_id)
        .order_by(col(Organization.created_at), col(Organization.id))
    )
    if not include_archived:
        statement = statement.where(col(Organization.archived_at).is_(None))
    result = await db.execute(statement)
    return [
        _organization_view(organization, membership.role)
        for organization, membership in result.all()
    ]


async def create_organization_for_user(
    db: AsyncSession,
    *,
    user: User,
    name: str,
    slug: str,
    project_name: str,
    project_slug: str,
    description: str | None = None,
) -> OrganizationView:
    try:
        organization = await create_organization_with_project(
            db,
            owner=user,
            name=name,
            slug=slug,
            description=description,
            project_name=project_name,
            project_slug=project_slug,
        )
        await log_action(
            db,
            api_key_id=None,
            organization_id=organization.id,
            actor_user_id=user.id,
            action="organization.created",
            resource_type="organization",
            resource_id=str(organization.id),
            metadata={"name": organization.name, "slug": organization.slug},
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise SlugConflictError("Organization") from exc
    return _organization_view(organization, OrganizationRole.OWNER)


async def list_projects_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    include_archived: bool = False,
) -> list[ProjectView]:
    await authorize_organization(
        db,
        user_id=user_id,
        organization_id=organization_id,
        capability=OrganizationCapability.READ,
    )
    statement = (
        select(Project)
        .where(col(Project.organization_id) == organization_id)
        .order_by(col(Project.created_at), col(Project.id))
    )
    if not include_archived:
        statement = statement.where(col(Project.archived_at).is_(None))
    result = await db.execute(statement)
    return [_project_view(project) for project in result.scalars().all()]


async def create_project_for_user(
    db: AsyncSession,
    *,
    user: User,
    organization_id: uuid.UUID,
    name: str,
    slug: str,
    description: str | None = None,
) -> ProjectView:
    access = await authorize_organization(
        db,
        user_id=user.id,
        organization_id=organization_id,
        capability=OrganizationCapability.CREATE_PROJECT,
    )
    try:
        project = await create_project(
            db,
            organization=access.organization,
            creator=user,
            name=name,
            slug=slug,
            description=description,
        )
        await log_action(
            db,
            api_key_id=None,
            organization_id=access.organization.id,
            project_id=project.id,
            actor_user_id=user.id,
            action="project.created",
            resource_type="project",
            resource_id=str(project.id),
            metadata={"name": project.name, "slug": project.slug},
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise SlugConflictError("Project") from exc
    return _project_view(project)


async def get_organization_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> OrganizationView:
    access = await authorize_organization(
        db,
        user_id=user_id,
        organization_id=organization_id,
        capability=OrganizationCapability.READ,
    )
    return _organization_view(access.organization, access.membership.role)


async def update_organization_for_user(
    db: AsyncSession,
    *,
    user: User,
    organization_id: uuid.UUID,
    changes: dict[str, object],
) -> OrganizationView:
    access = await authorize_organization(
        db,
        user_id=user.id,
        organization_id=organization_id,
        capability=OrganizationCapability.MANAGE,
    )
    organization = access.organization
    previous = {field: getattr(organization, field) for field in changes}
    for field, value in changes.items():
        setattr(organization, field, value)
    organization.updated_at = utc_now()
    db.add(organization)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise SlugConflictError("Organization") from exc
    await log_action(
        db,
        api_key_id=None,
        organization_id=organization.id,
        actor_user_id=user.id,
        action="organization.updated",
        resource_type="organization",
        resource_id=str(organization.id),
        metadata={"previous": previous, "changes": changes},
    )
    await db.commit()
    return _organization_view(organization, access.membership.role)


async def archive_organization_for_user(
    db: AsyncSession,
    *,
    user: User,
    organization_id: uuid.UUID,
) -> OrganizationView:
    access = await authorize_organization(
        db,
        user_id=user.id,
        organization_id=organization_id,
        capability=OrganizationCapability.DELETE,
    )
    now = utc_now()
    access.organization.archived_at = now
    access.organization.updated_at = now
    projects = (
        await db.execute(select(Project).where(col(Project.organization_id) == organization_id))
    ).scalars()
    for project in projects:
        project.archived_at = now
        project.updated_at = now
        db.add(project)
    db.add(access.organization)
    await log_action(
        db,
        api_key_id=None,
        organization_id=organization_id,
        actor_user_id=user.id,
        action="organization.archived",
        resource_type="organization",
        resource_id=str(organization_id),
    )
    await db.commit()
    return _organization_view(access.organization, access.membership.role)


async def get_project_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
) -> ProjectView:
    access = await authorize_project(
        db,
        user_id=user_id,
        project_id=project_id,
        capability=OrganizationCapability.READ,
        allow_archived=True,
    )
    return _project_view(access.project)


async def update_project_for_user(
    db: AsyncSession,
    *,
    user: User,
    project_id: uuid.UUID,
    changes: dict[str, object],
) -> ProjectView:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT,
    )
    previous = {field: getattr(access.project, field) for field in changes}
    for field, value in changes.items():
        setattr(access.project, field, value)
    access.project.updated_at = utc_now()
    db.add(access.project)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise SlugConflictError("Project") from exc
    await log_action(
        db,
        api_key_id=None,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="project.updated",
        resource_type="project",
        resource_id=str(access.project.id),
        metadata={"previous": previous, "changes": changes},
    )
    await db.commit()
    return _project_view(access.project)


async def archive_project_for_user(
    db: AsyncSession,
    *,
    user: User,
    project_id: uuid.UUID,
) -> ProjectView:
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT,
        allow_archived=True,
    )
    if access.project.archived_at is None:
        now = utc_now()
        access.project.archived_at = now
        access.project.updated_at = now
        db.add(access.project)
        await log_action(
            db,
            api_key_id=None,
            organization_id=access.project.organization_id,
            project_id=access.project.id,
            actor_user_id=user.id,
            action="project.archived",
            resource_type="project",
            resource_id=str(access.project.id),
        )
        await db.commit()
    return _project_view(access.project)
