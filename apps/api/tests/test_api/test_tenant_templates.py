"""Session-auth, project/organization-scoped template endpoints."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens
from app.modules.notifications.enums import NotificationChannel
from app.modules.templates.model import Template
from app.modules.tenancy.lifecycle import create_organization, create_project
from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole


async def _authorization_header(user: User, db: AsyncSession, mock_redis) -> dict[str, str]:
    tokens = await create_user_tokens(user, db, mock_redis)
    return {"Authorization": f"Bearer {tokens.access_token}"}


async def _seed_owner_and_project(db: AsyncSession, *, org_slug: str, project_slug: str):
    owner = User(email=f"{org_slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name=org_slug, slug=org_slug)
    project = await create_project(
        db, organization=organization, creator=owner, name=project_slug, slug=project_slug
    )
    await db.commit()
    return owner, organization, project


async def _add_member(db: AsyncSession, *, organization_id, role: OrganizationRole) -> User:
    user = User(email=f"member-{uuid.uuid4().hex}@example.com", name="Member")
    db.add(user)
    await db.flush()
    db.add(OrganizationMembership(organization_id=organization_id, user_id=user.id, role=role))
    await db.commit()
    return user


async def test_project_templates_excludes_other_projects(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project_a = await _seed_owner_and_project(
        db, org_slug="acme-a", project_slug="alpha"
    )
    _owner_b, _organization_b, project_b = await _seed_owner_and_project(
        db, org_slug="acme-b", project_slug="beta"
    )
    db.add_all(
        [
            Template(
                project_id=project_a.id,
                name="Welcome A",
                channel=NotificationChannel.EMAIL,
                body="hi",
                variables=[],
            ),
            Template(
                project_id=project_b.id,
                name="Welcome B",
                channel=NotificationChannel.EMAIL,
                body="hi",
                variables=[],
            ),
        ]
    )
    await db.commit()

    response = await client.get(
        f"/api/v1/projects/{project_a.id}/templates",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["name"] for item in items] == ["Welcome A"]


async def test_project_defaults_excludes_project_owned_templates(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-c", project_slug="gamma"
    )
    db.add_all(
        [
            Template(
                project_id=None,
                name="System Default",
                channel=NotificationChannel.EMAIL,
                body="hi",
                variables=[],
            ),
            Template(
                project_id=project.id,
                name="Owned",
                channel=NotificationChannel.EMAIL,
                body="hi",
                variables=[],
            ),
        ]
    )
    await db.commit()

    response = await client.get(
        f"/api/v1/projects/{project.id}/templates/defaults",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["name"] for item in items] == ["System Default"]


async def test_organization_templates_spans_every_project(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner = User(email="org-wide@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Wide Org", slug="wide-org")
    project_a = await create_project(
        db, organization=organization, creator=owner, name="Alpha", slug="wide-alpha"
    )
    project_b = await create_project(
        db, organization=organization, creator=owner, name="Beta", slug="wide-beta"
    )
    await db.commit()
    db.add_all(
        [
            Template(
                project_id=project_a.id,
                name="Alpha Template",
                channel=NotificationChannel.EMAIL,
                body="hi",
                variables=[],
            ),
            Template(
                project_id=project_b.id,
                name="Beta Template",
                channel=NotificationChannel.EMAIL,
                body="hi",
                variables=[],
            ),
        ]
    )
    await db.commit()

    response = await client.get(
        f"/api/v1/organizations/{organization.id}/templates",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 200
    names = {item["name"] for item in response.json()["items"]}
    assert names == {"Alpha Template", "Beta Template"}


async def test_organization_templates_can_narrow_to_one_project(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner = User(email="org-narrow@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="Narrow Org", slug="narrow-org")
    project_a = await create_project(
        db, organization=organization, creator=owner, name="Alpha", slug="narrow-alpha"
    )
    project_b = await create_project(
        db, organization=organization, creator=owner, name="Beta", slug="narrow-beta"
    )
    await db.commit()
    db.add_all(
        [
            Template(
                project_id=project_a.id,
                name="Alpha Template",
                channel=NotificationChannel.EMAIL,
                body="hi",
                variables=[],
            ),
            Template(
                project_id=project_b.id,
                name="Beta Template",
                channel=NotificationChannel.EMAIL,
                body="hi",
                variables=[],
            ),
        ]
    )
    await db.commit()

    response = await client.get(
        f"/api/v1/organizations/{organization.id}/templates",
        params={"project_id": str(project_a.id)},
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 200
    names = {item["name"] for item in response.json()["items"]}
    assert names == {"Alpha Template"}


async def test_viewer_cannot_create_a_template(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    _owner, organization, project = await _seed_owner_and_project(
        db, org_slug="acme-viewer", project_slug="delta"
    )
    viewer = await _add_member(db, organization_id=organization.id, role=OrganizationRole.VIEWER)

    response = await client.post(
        f"/api/v1/projects/{project.id}/templates",
        json={"name": "Nope", "channel": "email", "body": "hi"},
        headers=await _authorization_header(viewer, db, mock_redis),
    )

    assert response.status_code == 403


async def test_owner_can_create_a_template_scoped_to_the_project(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-create", project_slug="epsilon"
    )

    response = await client.post(
        f"/api/v1/projects/{project.id}/templates",
        json={"name": "Receipt", "channel": "email", "body": "Thanks {{ name }}"},
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["project_id"] == str(project.id)
    assert data["api_key_id"] is None


async def test_another_projects_admin_cannot_update_this_projects_template(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    _owner_a, _organization_a, project_a = await _seed_owner_and_project(
        db, org_slug="acme-upd-a", project_slug="zeta"
    )
    owner_b, _organization_b, project_b = await _seed_owner_and_project(
        db, org_slug="acme-upd-b", project_slug="eta"
    )
    template = Template(
        project_id=project_a.id,
        name="Zeta template",
        channel=NotificationChannel.EMAIL,
        body="hi",
        variables=[],
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    response = await client.put(
        f"/api/v1/projects/{project_b.id}/templates/{template.id}",
        json={"body": "hijacked"},
        headers=await _authorization_header(owner_b, db, mock_redis),
    )

    assert response.status_code == 404


async def test_delete_soft_deletes_the_projects_template(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-del", project_slug="theta"
    )
    template = Template(
        project_id=project.id,
        name="Theta template",
        channel=NotificationChannel.EMAIL,
        body="hi",
        variables=[],
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    response = await client.delete(
        f"/api/v1/projects/{project.id}/templates/{template.id}",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 204
    await db.refresh(template)
    assert template.is_active is False


async def test_fork_a_system_default_creates_a_project_owned_copy(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-fork", project_slug="iota"
    )
    default = Template(
        project_id=None,
        name="System Default",
        channel=NotificationChannel.EMAIL,
        body="Default body",
        variables=["name"],
    )
    db.add(default)
    await db.commit()
    await db.refresh(default)

    response = await client.post(
        f"/api/v1/projects/{project.id}/templates/{default.id}/fork",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["project_id"] == str(project.id)
    assert data["body"] == "Default body"
    assert data["id"] != str(default.id)


async def test_forking_a_project_owned_template_is_rejected(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-fork-2", project_slug="kappa"
    )
    owned = Template(
        project_id=project.id,
        name="Already owned",
        channel=NotificationChannel.EMAIL,
        body="hi",
        variables=[],
    )
    db.add(owned)
    await db.commit()
    await db.refresh(owned)

    response = await client.post(
        f"/api/v1/projects/{project.id}/templates/{owned.id}/fork",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 404


async def test_duplicate_name_and_channel_in_the_same_project_is_rejected(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-dupe", project_slug="lambda"
    )
    await client.post(
        f"/api/v1/projects/{project.id}/templates",
        json={"name": "Receipt", "channel": "email", "body": "one"},
        headers=await _authorization_header(owner, db, mock_redis),
    )

    response = await client.post(
        f"/api/v1/projects/{project.id}/templates",
        json={"name": "Receipt", "channel": "email", "body": "two"},
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 409


async def test_same_name_and_channel_are_allowed_in_different_projects(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner_a, _organization_a, project_a = await _seed_owner_and_project(
        db, org_slug="same-name-a", project_slug="project-a"
    )
    owner_b, _organization_b, project_b = await _seed_owner_and_project(
        db, org_slug="same-name-b", project_slug="project-b"
    )

    for owner, project in ((owner_a, project_a), (owner_b, project_b)):
        response = await client.post(
            f"/api/v1/projects/{project.id}/templates",
            json={"name": "Receipt", "channel": "email", "body": "Thanks"},
            headers=await _authorization_header(owner, db, mock_redis),
        )
        assert response.status_code == 201


async def test_get_returns_a_template_owned_by_the_project(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-get", project_slug="mu"
    )
    template = Template(
        project_id=project.id,
        name="Mu template",
        channel=NotificationChannel.EMAIL,
        body="hi",
        variables=[],
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    response = await client.get(
        f"/api/v1/projects/{project.id}/templates/{template.id}",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 200
    assert response.json()["id"] == str(template.id)


async def test_update_rejects_null_for_required_template_fields(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-null-update", project_slug="null-update"
    )
    template = Template(
        project_id=project.id,
        name="Required fields",
        channel=NotificationChannel.EMAIL,
        body="hi",
        variables=[],
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    response = await client.put(
        f"/api/v1/projects/{project.id}/templates/{template.id}",
        json={"body": None},
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 422


async def test_get_returns_a_system_default_via_any_project(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="acme-get-default", project_slug="nu"
    )
    default = Template(
        project_id=None,
        name="Nu default",
        channel=NotificationChannel.EMAIL,
        body="hi",
        variables=[],
    )
    db.add(default)
    await db.commit()
    await db.refresh(default)

    response = await client.get(
        f"/api/v1/projects/{project.id}/templates/{default.id}",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 200
    assert response.json()["project_id"] is None


async def test_get_404s_for_another_projects_template(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    _owner_a, _organization_a, project_a = await _seed_owner_and_project(
        db, org_slug="acme-get-a", project_slug="xi"
    )
    owner_b, _organization_b, project_b = await _seed_owner_and_project(
        db, org_slug="acme-get-b", project_slug="omicron"
    )
    template = Template(
        project_id=project_a.id,
        name="Xi template",
        channel=NotificationChannel.EMAIL,
        body="hi",
        variables=[],
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    response = await client.get(
        f"/api/v1/projects/{project_b.id}/templates/{template.id}",
        headers=await _authorization_header(owner_b, db, mock_redis),
    )

    assert response.status_code == 404
