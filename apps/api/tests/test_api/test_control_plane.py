"""SaaS control-plane lifecycle tests."""

import uuid
from unittest.mock import AsyncMock

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens
from app.modules.observability.usage.model import ApiKeyUsage
from app.modules.tenancy.lifecycle import create_organization, create_project


async def _headers(user: User, db: AsyncSession, redis: AsyncMock) -> dict[str, str]:
    tokens = await create_user_tokens(user, db, redis)
    return {"Authorization": f"Bearer {tokens.access_token}"}


async def test_creating_an_organization_also_creates_its_first_project(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    user = User(email="org-creator@example.com", name="Creator")
    db.add(user)
    await db.flush()
    await db.commit()
    headers = await _headers(user, db, mock_redis)

    created = await client.post(
        "/api/v1/organizations",
        headers=headers,
        json={
            "name": "Fresh Co",
            "slug": "fresh-co",
            "project": {"name": "Web", "slug": "web"},
        },
    )
    assert created.status_code == 201
    organization_id = created.json()["id"]

    projects = await client.get(
        f"/api/v1/organizations/{organization_id}/projects",
        headers=headers,
    )
    assert projects.status_code == 200
    body = projects.json()
    assert [(project["name"], project["slug"]) for project in body] == [("Web", "web")]


async def test_creating_an_organization_requires_a_first_project(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    user = User(email="org-creator-2@example.com", name="Creator")
    db.add(user)
    await db.flush()
    await db.commit()
    headers = await _headers(user, db, mock_redis)

    response = await client.post(
        "/api/v1/organizations",
        headers=headers,
        json={"name": "No Project Co", "slug": "no-project-co"},
    )
    assert response.status_code == 422


async def test_owner_edits_and_archives_organization_and_project(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="owner-edit@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Before", slug="before")
    project = await create_project(
        db,
        organization=organization,
        creator=owner,
        name="Old Project",
        slug="old-project",
    )
    await db.commit()
    headers = await _headers(owner, db, mock_redis)

    organization_response = await client.patch(
        f"/api/v1/organizations/{organization.id}",
        headers=headers,
        json={"name": "After", "slug": "after", "description": "Updated workspace"},
    )
    project_response = await client.patch(
        f"/api/v1/projects/{project.id}",
        headers=headers,
        json={"name": "New Project", "description": "Updated project"},
    )
    archive_response = await client.delete(f"/api/v1/projects/{project.id}", headers=headers)

    assert organization_response.status_code == 200
    assert organization_response.json()["slug"] == "after"
    assert project_response.status_code == 200
    assert project_response.json()["name"] == "New Project"
    assert archive_response.status_code == 200
    assert archive_response.json()["archived_at"] is not None
    projects = await client.get(
        f"/api/v1/organizations/{organization.id}/projects",
        headers=headers,
    )
    assert projects.json() == []


async def test_final_owner_cannot_be_demoted_or_removed(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="final-owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="owner-guard")
    await db.commit()
    memberships = await client.get(
        f"/api/v1/organizations/{organization.id}/members",
        headers=await _headers(owner, db, mock_redis),
    )
    membership_id = memberships.json()[0]["id"]

    demote = await client.patch(
        f"/api/v1/organizations/{organization.id}/members/{membership_id}",
        headers=await _headers(owner, db, mock_redis),
        json={"role": "admin"},
    )
    remove = await client.delete(
        f"/api/v1/organizations/{organization.id}/members/{membership_id}",
        headers=await _headers(owner, db, mock_redis),
    )

    assert demote.status_code == 409
    assert remove.status_code == 409


async def test_verified_invitee_accepts_invitation(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
    monkeypatch,
) -> None:
    owner = User(email="invite-owner@example.com", name="Owner")
    invitee = User(email="invitee@example.com", name="Invitee")
    db.add_all([owner, invitee])
    await db.flush()
    db.add(
        EmailAddress(
            user_id=invitee.id,
            email=invitee.email,
            is_primary=True,
            verified_at=invitee.created_at,
        )
    )
    organization = await create_organization(db, owner=owner, name="Invite Org", slug="invite-org")
    await db.commit()
    monkeypatch.setattr(
        "app.modules.tenancy.invitations.service.secrets.token_urlsafe",
        lambda _length: "known-invitation-token",
    )

    invitation = await client.post(
        f"/api/v1/organizations/{organization.id}/invitations",
        headers=await _headers(owner, db, mock_redis),
        json={"email": invitee.email, "role": "member"},
    )
    acceptance = await client.post(
        "/api/v1/invitations/accept",
        headers=await _headers(invitee, db, mock_redis),
        json={"token": "known-invitation-token"},
    )

    assert invitation.status_code == 201
    assert acceptance.status_code == 204
    members = await client.get(
        f"/api/v1/organizations/{organization.id}/members",
        headers=await _headers(owner, db, mock_redis),
    )
    assert {item["email"] for item in members.json()} == {owner.email, invitee.email}


async def test_api_key_can_be_edited_and_rotated(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="key-owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Keys", slug="keys")
    project = await create_project(
        db,
        organization=organization,
        creator=owner,
        name="Production",
        slug="production-keys",
    )
    await db.commit()
    headers = await _headers(owner, db, mock_redis)
    created = await client.post(
        f"/api/v1/projects/{project.id}/api-keys",
        headers=headers,
        json={"name": "Initial", "environment": "test", "scopes": ["events:write"]},
    )
    old_secret = created.json()["key"]
    key_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/projects/{project.id}/api-keys/{key_id}",
        headers=headers,
        json={"name": "Updated", "scopes": ["events:read", "events:write"]},
    )
    rotated = await client.post(
        f"/api/v1/projects/{project.id}/api-keys/{key_id}/rotate",
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["name"] == "Updated"
    assert rotated.status_code == 200
    assert rotated.json()["key"] != old_secret
    assert rotated.json()["environment"] == "test"
    rejected = await client.get("/api/v1/templates", headers={"X-API-Key": old_secret})
    assert rejected.status_code == 401


async def test_usage_summaries_roll_up_from_project_to_organization(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="usage-owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Usage", slug="usage")
    project = await create_project(
        db,
        organization=organization,
        creator=owner,
        name="Usage Project",
        slug="usage-project",
    )
    await db.commit()
    headers = await _headers(owner, db, mock_redis)
    key_response = await client.post(
        f"/api/v1/projects/{project.id}/api-keys",
        headers=headers,
        json={"name": "Metered", "environment": "live", "scopes": ["usage:read"]},
    )
    key_id = uuid.UUID(key_response.json()["id"])
    db.add_all(
        [
            ApiKeyUsage(
                api_key_id=key_id,
                endpoint="/api/v1/events",
                method="POST",
                status_code=202,
                hour_bucket=owner.created_at,
                request_count=8,
            ),
            ApiKeyUsage(
                api_key_id=key_id,
                endpoint="/api/v1/events",
                method="POST",
                status_code=500,
                hour_bucket=owner.created_at,
                request_count=2,
            ),
        ]
    )
    await db.commit()

    project_summary = await client.get(
        f"/api/v1/projects/{project.id}/usage/summary",
        headers=headers,
    )
    organization_summary = await client.get(
        f"/api/v1/organizations/{organization.id}/usage/summary",
        headers=headers,
    )

    assert project_summary.status_code == 200
    assert project_summary.json()["total_requests"] == 10
    assert project_summary.json()["successful_requests"] == 8
    assert project_summary.json()["failed_requests"] == 2
    assert project_summary.json()["by_environment"][0]["environment"] == "live"
    assert organization_summary.json() == project_summary.json()
