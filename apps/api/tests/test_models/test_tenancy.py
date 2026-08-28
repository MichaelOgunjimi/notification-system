"""Tenant ownership model integration tests."""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.credentials.model import ApiKey
from app.modules.identity.models.user import User
from app.modules.tenancy.lifecycle import create_organization, create_project
from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole
from app.modules.tenancy.models.project import Project


async def test_user_can_own_an_organization_through_membership(db: AsyncSession) -> None:
    user = User(email="owner@example.com", name="Owner")
    db.add(user)
    await db.flush()

    organization = await create_organization(db, owner=user, name="Acme", slug="acme")
    await db.commit()

    result = await db.execute(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization.id,
            OrganizationMembership.user_id == user.id,
        )
    )

    stored_membership = result.scalar_one()
    assert stored_membership.role == OrganizationRole.OWNER


async def test_user_has_only_one_membership_per_organization(db: AsyncSession) -> None:
    user = User(email="member@example.com", name="Member")
    db.add(user)
    await db.flush()
    organization = await create_organization(db, owner=user, name="Acme", slug="acme")

    db.add(
        OrganizationMembership(
            organization_id=organization.id,
            user_id=user.id,
            role=OrganizationRole.ADMIN,
        )
    )

    with pytest.raises(IntegrityError):
        await db.commit()


async def test_organization_can_contain_multiple_projects(db: AsyncSession) -> None:
    user = User(email="projects@example.com", name="Owner")
    db.add(user)
    await db.flush()
    organization = await create_organization(db, owner=user, name="Acme", slug="acme")

    await create_project(
        db,
        organization=organization,
        creator=user,
        name="Production",
        slug="production",
    )
    await create_project(
        db,
        organization=organization,
        creator=user,
        name="Development",
        slug="development",
    )
    await db.commit()

    result = await db.execute(select(Project).where(Project.organization_id == organization.id))
    assert {project.slug for project in result.scalars()} == {"production", "development"}


async def test_project_can_have_multiple_api_keys(db: AsyncSession) -> None:
    user = User(email="keys@example.com", name="Owner")
    db.add(user)
    await db.flush()
    organization = await create_organization(db, owner=user, name="Acme", slug="acme")
    project = await create_project(
        db,
        organization=organization,
        creator=user,
        name="Production",
        slug="production",
    )

    db.add_all(
        [
            ApiKey(
                project_id=project.id,
                created_by_user_id=user.id,
                key_hash="hash-one",
                key_prefix="nk_one",
                name="Backend",
            ),
            ApiKey(
                project_id=project.id,
                created_by_user_id=user.id,
                key_hash="hash-two",
                key_prefix="nk_two",
                name="CI",
            ),
        ]
    )
    await db.commit()

    result = await db.execute(select(ApiKey).where(ApiKey.project_id == project.id))
    assert {api_key.name for api_key in result.scalars()} == {"Backend", "CI"}
