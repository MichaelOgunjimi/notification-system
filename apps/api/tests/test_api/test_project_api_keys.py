"""Project API-key management and scope behavior tests."""

from unittest.mock import AsyncMock

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens
from app.modules.tenancy.lifecycle import create_organization, create_project
from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole


async def _authorization_header(
    user: User,
    db: AsyncSession,
    redis: AsyncMock,
) -> dict[str, str]:
    tokens = await create_user_tokens(user, db, redis)
    return {"Authorization": f"Bearer {tokens.access_token}"}


async def test_organization_admin_creates_a_scoped_project_api_key(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    project = await create_project(
        db,
        organization=organization,
        creator=owner,
        name="Production",
        slug="production",
    )
    await db.commit()

    response = await client.post(
        f"/api/v1/projects/{project.id}/api-keys",
        headers=await _authorization_header(owner, db, mock_redis),
        json={
            "name": "Production sender",
            "description": "Used by the production application",
            "scopes": ["events:write"],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == str(project.id)
    assert body["name"] == "Production sender"
    assert body["scopes"] == ["events:write"]
    assert body["key"].startswith("nk_")


async def test_organization_member_cannot_manage_project_api_keys(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    member = User(email="member@example.com", name="Member")
    db.add_all([owner, member])
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    project = await create_project(
        db,
        organization=organization,
        creator=owner,
        name="Production",
        slug="production",
    )
    db.add(
        OrganizationMembership(
            organization_id=organization.id,
            user_id=member.id,
            role=OrganizationRole.MEMBER,
        )
    )
    await db.commit()

    response = await client.post(
        f"/api/v1/projects/{project.id}/api-keys",
        headers=await _authorization_header(member, db, mock_redis),
        json={"name": "Forbidden key", "scopes": ["events:write"]},
    )

    assert response.status_code == 403


async def test_listing_project_api_keys_is_project_scoped_and_hides_secrets(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    first_project = await create_project(
        db, organization=organization, creator=owner, name="First", slug="first"
    )
    second_project = await create_project(
        db, organization=organization, creator=owner, name="Second", slug="second"
    )
    await db.commit()
    headers = await _authorization_header(owner, db, mock_redis)
    first_create = await client.post(
        f"/api/v1/projects/{first_project.id}/api-keys",
        headers=headers,
        json={"name": "First key", "scopes": ["events:write"]},
    )
    await client.post(
        f"/api/v1/projects/{second_project.id}/api-keys",
        headers=headers,
        json={"name": "Second key", "scopes": ["events:write"]},
    )

    response = await client.get(
        f"/api/v1/projects/{first_project.id}/api-keys",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == first_create.json()["id"]
    assert "key" not in response.json()["items"][0]


async def test_revoking_project_api_key_invalidates_the_secret(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    project = await create_project(
        db, organization=organization, creator=owner, name="Production", slug="production"
    )
    await db.commit()
    headers = await _authorization_header(owner, db, mock_redis)
    create_response = await client.post(
        f"/api/v1/projects/{project.id}/api-keys",
        headers=headers,
        json={"name": "Temporary", "scopes": ["events:write"]},
    )
    key_id = create_response.json()["id"]
    raw_key = create_response.json()["key"]

    revoke_response = await client.delete(
        f"/api/v1/projects/{project.id}/api-keys/{key_id}",
        headers=headers,
    )
    use_response = await client.get(
        "/api/v1/templates",
        headers={"X-API-Key": raw_key},
    )

    assert revoke_response.status_code == 204
    assert use_response.status_code == 401


async def test_api_key_scope_allows_event_writes_but_denies_template_reads(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    project = await create_project(
        db, organization=organization, creator=owner, name="Production", slug="production"
    )
    await db.commit()
    create_response = await client.post(
        f"/api/v1/projects/{project.id}/api-keys",
        headers=await _authorization_header(owner, db, mock_redis),
        json={"name": "Event sender", "scopes": ["events:write"]},
    )
    raw_key = create_response.json()["key"]

    event_response = await client.post(
        "/api/v1/events",
        headers={"X-API-Key": raw_key},
        json={
            "event_type": "user.signup",
            "recipients": [
                {
                    "user_id": "user-1",
                    "channels": ["email"],
                    "email": "user@example.com",
                }
            ],
            "payload": {"welcome": True},
        },
    )
    template_response = await client.get(
        "/api/v1/templates",
        headers={"X-API-Key": raw_key},
    )

    assert event_response.status_code == 202
    assert template_response.status_code == 403


async def test_read_scope_does_not_grant_write_access(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis: AsyncMock,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    project = await create_project(
        db, organization=organization, creator=owner, name="Production", slug="production"
    )
    await db.commit()
    create_response = await client.post(
        f"/api/v1/projects/{project.id}/api-keys",
        headers=await _authorization_header(owner, db, mock_redis),
        json={"name": "Template reader", "scopes": ["templates:read"]},
    )
    raw_key = create_response.json()["key"]

    read_response = await client.get("/api/v1/templates", headers={"X-API-Key": raw_key})
    write_response = await client.post(
        "/api/v1/templates",
        headers={"X-API-Key": raw_key},
        json={
            "name": "forbidden",
            "channel": "email",
            "subject": "Hello",
            "body": "Hello",
        },
    )

    assert read_response.status_code == 200
    assert write_response.status_code == 403
