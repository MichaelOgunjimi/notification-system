"""Organization-wide membership, project, and observability authorization tests."""

import uuid
from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.credentials.model import ApiKey
from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens
from app.modules.observability.audit.model import AuditLog
from app.modules.observability.usage.model import ApiKeyUsage
from app.modules.tenancy.lifecycle import create_organization, create_project
from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole


async def _authorization_header(user: User, db: AsyncSession, mock_redis) -> dict[str, str]:
    tokens = await create_user_tokens(user, db, mock_redis)
    return {"Authorization": f"Bearer {tokens.access_token}"}


async def test_user_lists_only_organizations_they_belong_to(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis,
) -> None:
    user = User(email="member@example.com", name="Member")
    stranger = User(email="stranger@example.com", name="Stranger")
    db.add_all([user, stranger])
    await db.flush()
    visible = await create_organization(db, owner=user, name="Visible", slug="visible")
    await create_organization(db, owner=stranger, name="Hidden", slug="hidden")
    await db.commit()

    response = await client.get(
        "/api/v1/organizations",
        headers=await _authorization_header(user, db, mock_redis),
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0] == {
        "id": str(visible.id),
        "name": "Visible",
        "slug": "visible",
        "description": None,
        "role": "owner",
        "capabilities": [
            "organization:read",
            "organization:manage",
            "organization:members:manage",
            "project:create",
            "project:manage",
            "api_key:manage",
            "project:usage:read",
            "project:audit:read",
            "organization:usage:read",
            "organization:audit:read",
            "organization:billing:manage",
            "organization:delete",
        ],
        "created_at": visible.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": visible.updated_at.isoformat().replace("+00:00", "Z"),
        "archived_at": None,
    }


async def test_admin_can_create_project_for_the_organization(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    admin = User(email="admin@example.com", name="Admin")
    db.add_all([owner, admin])
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    db.add(
        OrganizationMembership(
            organization_id=organization.id,
            user_id=admin.id,
            role=OrganizationRole.ADMIN,
        )
    )
    await db.commit()

    response = await client.post(
        f"/api/v1/organizations/{organization.id}/projects",
        headers=await _authorization_header(admin, db, mock_redis),
        json={"name": "Production", "slug": "production"},
    )

    assert response.status_code == 201
    assert response.json()["organization_id"] == str(organization.id)
    assert response.json()["created_by_user_id"] == str(admin.id)

    audit_response = await client.get(
        f"/api/v1/organizations/{organization.id}/audit-log",
        headers=await _authorization_header(admin, db, mock_redis),
    )
    assert audit_response.status_code == 200
    assert audit_response.json()["items"][0]["action"] == "project.created"
    assert audit_response.json()["items"][0]["actor_user_id"] == str(admin.id)


async def test_member_can_list_projects_but_cannot_create_one(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis,
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
        name="Existing",
        slug="existing",
    )
    db.add(
        OrganizationMembership(
            organization_id=organization.id,
            user_id=member.id,
            role=OrganizationRole.MEMBER,
        )
    )
    await db.commit()
    headers = await _authorization_header(member, db, mock_redis)

    list_response = await client.get(
        f"/api/v1/organizations/{organization.id}/projects",
        headers=headers,
    )
    create_response = await client.post(
        f"/api/v1/organizations/{organization.id}/projects",
        headers=headers,
        json={"name": "Forbidden", "slug": "forbidden"},
    )

    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [str(project.id)]
    assert create_response.status_code == 403


async def test_non_member_cannot_discover_an_organization(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    stranger = User(email="stranger@example.com", name="Stranger")
    db.add_all([owner, stranger])
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    await db.commit()

    response = await client.get(
        f"/api/v1/organizations/{organization.id}/projects",
        headers=await _authorization_header(stranger, db, mock_redis),
    )

    assert response.status_code == 404


async def test_project_usage_is_scoped_to_the_selected_project(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    project = await create_project(
        db, organization=organization, creator=owner, name="Production", slug="production"
    )
    other_project = await create_project(
        db, organization=organization, creator=owner, name="Staging", slug="staging"
    )
    project_key = ApiKey(
        project_id=project.id,
        created_by_user_id=owner.id,
        key_hash="project-hash",
        key_prefix="project-ke",
        name="Project key",
    )
    other_key = ApiKey(
        project_id=other_project.id,
        created_by_user_id=owner.id,
        key_hash="other-hash",
        key_prefix="other-key-",
        name="Other key",
    )
    db.add_all([project_key, other_key])
    await db.flush()
    bucket = datetime(2026, 8, 27, 14, tzinfo=UTC)
    db.add_all(
        [
            ApiKeyUsage(
                api_key_id=project_key.id,
                endpoint="/api/v1/events",
                method="POST",
                status_code=202,
                hour_bucket=bucket,
                request_count=7,
            ),
            ApiKeyUsage(
                api_key_id=other_key.id,
                endpoint="/api/v1/events",
                method="POST",
                status_code=202,
                hour_bucket=bucket,
                request_count=99,
            ),
        ]
    )
    await db.commit()

    response = await client.get(
        f"/api/v1/projects/{project.id}/usage",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["project_id"] == str(project.id)
    assert response.json()["items"][0]["request_count"] == 7


async def test_organization_audit_spans_projects_and_requires_admin(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis,
) -> None:
    owner = User(email="owner@example.com", name="Owner")
    member = User(email="member@example.com", name="Member")
    db.add_all([owner, member])
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme")
    project = await create_project(
        db, organization=organization, creator=owner, name="Production", slug="production"
    )
    second_project = await create_project(
        db, organization=organization, creator=owner, name="Staging", slug="staging"
    )
    db.add(
        OrganizationMembership(
            organization_id=organization.id,
            user_id=member.id,
            role=OrganizationRole.MEMBER,
        )
    )
    keys = [
        ApiKey(
            project_id=current_project.id,
            created_by_user_id=owner.id,
            key_hash=f"hash-{index}",
            key_prefix=f"key-{index}",
            name=f"Key {index}",
        )
        for index, current_project in enumerate((project, second_project))
    ]
    db.add_all(keys)
    await db.flush()
    db.add_all(
        [
            AuditLog(
                api_key_id=key.id,
                action="template.created",
                resource_type="template",
                resource_id=str(uuid.uuid4()),
            )
            for key in keys
        ]
    )
    await db.commit()

    owner_response = await client.get(
        f"/api/v1/organizations/{organization.id}/audit-log",
        headers=await _authorization_header(owner, db, mock_redis),
    )
    member_response = await client.get(
        f"/api/v1/organizations/{organization.id}/audit-log",
        headers=await _authorization_header(member, db, mock_redis),
    )

    assert owner_response.status_code == 200
    assert owner_response.json()["total"] == 2
    assert {item["project_id"] for item in owner_response.json()["items"]} == {
        str(project.id),
        str(second_project.id),
    }
    assert member_response.status_code == 403


async def test_organization_audit_filters_by_actor_and_names_them(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis,
) -> None:
    owner = User(email="audit-owner@example.com", name="Ada Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme-actor")
    project = await create_project(
        db, organization=organization, creator=owner, name="Prod", slug="prod-actor"
    )
    key = ApiKey(
        project_id=project.id,
        created_by_user_id=owner.id,
        key_hash="hash-actor",
        key_prefix="key-actor",
        name="Deploy key",
    )
    db.add(key)
    await db.flush()
    db.add_all(
        [
            AuditLog(
                actor_user_id=owner.id,
                organization_id=organization.id,
                action="organization.member_invited",
                resource_type="organization_invitation",
            ),
            AuditLog(
                api_key_id=key.id,
                action="event.created",
                resource_type="event",
            ),
        ]
    )
    await db.commit()
    headers = await _authorization_header(owner, db, mock_redis)
    base = f"/api/v1/organizations/{organization.id}/audit-log"

    people = (await client.get(f"{base}?actor=user", headers=headers)).json()
    keys = (await client.get(f"{base}?actor=api_key", headers=headers)).json()
    just_owner = (await client.get(f"{base}?actor={owner.id}", headers=headers)).json()

    assert {item["action"] for item in people["items"]} == {"organization.member_invited"}
    assert people["items"][0]["actor_name"] == "Ada Owner"
    assert people["items"][0]["actor_role"] == "owner"
    assert {item["action"] for item in keys["items"]} == {"event.created"}
    assert keys["items"][0]["api_key_name"] == "Deploy key"
    assert keys["items"][0]["api_key_environment"] == "live"
    assert keys["items"][0]["actor_name"] is None
    assert keys["items"][0]["actor_role"] is None
    assert {item["action"] for item in just_owner["items"]} == {"organization.member_invited"}


async def test_organization_audit_splits_by_category_and_bounds_by_date(
    client: AsyncClient,
    db: AsyncSession,
    mock_redis,
) -> None:
    owner = User(email="audit-cat@example.com", name="Cat Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Cat", slug="cat-cat")
    project = await create_project(
        db, organization=organization, creator=owner, name="Prod", slug="prod-cat"
    )
    old = datetime(2026, 1, 1, 12, 0, 0)
    recent = datetime(2026, 6, 1, 12, 0, 0)
    db.add_all(
        [
            AuditLog(
                actor_user_id=owner.id,
                organization_id=organization.id,
                project_id=project.id,
                action="api_key.created",
                resource_type="api_key",
                created_at=recent,
            ),
            AuditLog(
                actor_user_id=owner.id,
                organization_id=organization.id,
                project_id=project.id,
                action="event.created",
                resource_type="event",
                created_at=recent,
            ),
            AuditLog(
                actor_user_id=owner.id,
                organization_id=organization.id,
                project_id=project.id,
                action="project.updated",
                resource_type="project",
                created_at=old,
            ),
        ]
    )
    await db.commit()
    headers = await _authorization_header(owner, db, mock_redis)
    base = f"/api/v1/organizations/{organization.id}/audit-log"

    governance = (await client.get(f"{base}?category=governance", headers=headers)).json()
    operational = (await client.get(f"{base}?category=operational", headers=headers)).json()
    windowed = (
        await client.get(f"{base}?category=governance&from=2026-03-01T00:00:00", headers=headers)
    ).json()

    assert {item["action"] for item in governance["items"]} == {
        "api_key.created",
        "project.updated",
    }
    assert {item["action"] for item in operational["items"]} == {"event.created"}
    assert {item["action"] for item in windowed["items"]} == {"api_key.created"}
