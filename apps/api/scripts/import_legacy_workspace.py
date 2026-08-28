"""Import projectless API keys into one authenticated workspace.

This is an explicit data migration, not runtime compatibility logic. Every legacy key
must be named in exactly one ``--project`` mapping before the transaction can commit.

Example:
    uv run python -m scripts.import_legacy_workspace \
      --email owner@example.com \
      --name Owner \
      --organization-name "Owner's Workspace" \
      --organization-slug owner-workspace \
      --project default=seed-dev-key \
      --project testing=test-4,test-5,testing-2
"""

import argparse
import asyncio
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.database import async_session
from app.core.datetime import utc_now
from app.modules.credentials.model import ApiKey
from app.modules.credentials.types import ALL_API_KEY_SCOPES
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User
from app.modules.tenancy.lifecycle import create_organization, create_project
from app.modules.tenancy.models.organization import (
    Organization,
    OrganizationMembership,
    OrganizationRole,
)
from app.modules.tenancy.models.project import Project


@dataclass(frozen=True, slots=True)
class ProjectImport:
    slug: str
    key_names: frozenset[str]

    @property
    def name(self) -> str:
        return self.slug.replace("-", " ").title()


def _parse_project(value: str) -> ProjectImport:
    slug, separator, raw_names = value.partition("=")
    key_names = frozenset(name.strip() for name in raw_names.split(",") if name.strip())
    if not separator or not slug.strip() or not key_names:
        raise argparse.ArgumentTypeError("project mappings must use slug=key-name[,key-name]")
    return ProjectImport(slug=slug.strip().lower(), key_names=key_names)


def _validate_mappings(projects: list[ProjectImport]) -> None:
    claimed_names: set[str] = set()
    for project in projects:
        duplicates = claimed_names.intersection(project.key_names)
        if duplicates:
            duplicate_list = ", ".join(sorted(duplicates))
            raise ValueError(f"API key names mapped to more than one project: {duplicate_list}")
        claimed_names.update(project.key_names)


async def _get_or_create_owner(
    db: AsyncSession,
    *,
    email: str,
    name: str,
) -> User:
    result = await db.execute(select(User).where(col(User.email) == email))
    user = result.scalar_one_or_none()
    verified_at = utc_now()
    if user is None:
        user = User(
            email=email,
            name=name,
            email_verified_at=verified_at,
        )
        db.add(user)
        await db.flush()
    elif user.email_verified_at is None:
        user.email_verified_at = verified_at
        db.add(user)

    email_result = await db.execute(select(EmailAddress).where(col(EmailAddress.email) == email))
    email_address = email_result.scalar_one_or_none()
    if email_address is None:
        db.add(
            EmailAddress(
                user_id=user.id,
                email=email,
                is_primary=True,
                verified_at=verified_at,
            )
        )
    elif email_address.user_id != user.id:
        raise ValueError(f"Email address {email} already belongs to another user")
    elif email_address.verified_at is None:
        email_address.verified_at = verified_at
        db.add(email_address)

    await db.flush()
    return user


async def _get_or_create_organization(
    db: AsyncSession,
    *,
    owner: User,
    name: str,
    slug: str,
) -> Organization:
    result = await db.execute(select(Organization).where(col(Organization.slug) == slug))
    organization = result.scalar_one_or_none()
    if organization is None:
        return await create_organization(db, owner=owner, name=name, slug=slug)

    membership_result = await db.execute(
        select(OrganizationMembership).where(
            col(OrganizationMembership.organization_id) == organization.id,
            col(OrganizationMembership.user_id) == owner.id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        db.add(
            OrganizationMembership(
                organization_id=organization.id,
                user_id=owner.id,
                role=OrganizationRole.OWNER,
            )
        )
    elif membership.role != OrganizationRole.OWNER:
        membership.role = OrganizationRole.OWNER
        db.add(membership)
    await db.flush()
    return organization


async def ensure_workspace_project(
    db: AsyncSession,
    *,
    email: str,
    owner_name: str,
    organization_name: str,
    organization_slug: str,
    project_name: str,
    project_slug: str,
) -> tuple[User, Organization, Project]:
    """Return an idempotently created owner, workspace, and project."""
    owner = await _get_or_create_owner(db, email=email.lower(), name=owner_name)
    organization = await _get_or_create_organization(
        db,
        owner=owner,
        name=organization_name,
        slug=organization_slug,
    )
    project_result = await db.execute(
        select(Project).where(
            col(Project.organization_id) == organization.id,
            col(Project.slug) == project_slug,
        )
    )
    project = project_result.scalar_one_or_none()
    if project is None:
        project = await create_project(
            db,
            organization=organization,
            creator=owner,
            name=project_name,
            slug=project_slug,
        )
    return owner, organization, project


async def import_workspace(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    organization_name: str,
    organization_slug: str,
    project_imports: list[ProjectImport],
) -> dict[str, int]:
    """Create the workspace and move every unassigned key into an explicit project."""
    email = email.strip().lower()
    _validate_mappings(project_imports)

    keys_result = await db.execute(select(ApiKey).order_by(col(ApiKey.created_at)))
    api_keys = list(keys_result.scalars().all())
    unassigned_names = {api_key.name for api_key in api_keys if api_key.project_id is None}
    mapped_names = {name for project in project_imports for name in project.key_names}
    missing_mappings = unassigned_names - mapped_names
    unknown_mappings = mapped_names - {api_key.name for api_key in api_keys}
    if missing_mappings:
        raise ValueError(
            "Unassigned API keys are missing project mappings: "
            + ", ".join(sorted(missing_mappings))
        )
    if unknown_mappings:
        raise ValueError(
            "Mappings reference unknown API keys: " + ", ".join(sorted(unknown_mappings))
        )

    owner = await _get_or_create_owner(db, email=email, name=name)
    organization = await _get_or_create_organization(
        db,
        owner=owner,
        name=organization_name,
        slug=organization_slug,
    )

    assigned = 0
    for project_import in project_imports:
        project_result = await db.execute(
            select(Project).where(
                col(Project.organization_id) == organization.id,
                col(Project.slug) == project_import.slug,
            )
        )
        project = project_result.scalar_one_or_none()
        if project is None:
            project = await create_project(
                db,
                organization=organization,
                creator=owner,
                name=project_import.name,
                slug=project_import.slug,
            )

        for api_key in api_keys:
            if api_key.name not in project_import.key_names:
                continue
            if api_key.project_id not in (None, project.id):
                raise ValueError(f"API key {api_key.name} already belongs to another project")
            api_key.project_id = project.id
            api_key.created_by_user_id = owner.id
            api_key.scopes = list(ALL_API_KEY_SCOPES)
            db.add(api_key)
            assigned += 1

    await db.commit()
    return {
        "projects": len(project_imports),
        "keys": assigned,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--organization-name", required=True)
    parser.add_argument("--organization-slug", required=True)
    parser.add_argument("--project", action="append", type=_parse_project, required=True)
    return parser.parse_args()


async def _main() -> None:
    args = _parse_args()
    async with async_session() as db:
        result = await import_workspace(
            db,
            email=args.email,
            name=args.name,
            organization_name=args.organization_name,
            organization_slug=args.organization_slug,
            project_imports=args.project,
        )
    print(
        f"Imported {result['keys']} API keys into {result['projects']} projects "
        f"for {args.email.lower()}."
    )


if __name__ == "__main__":
    asyncio.run(_main())
