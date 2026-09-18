"""Session-auth, project-scoped alert rule endpoints."""

import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens
from app.modules.observability.alerts.model import AlertRule
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


async def test_viewer_cannot_create_an_alert_rule(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    _owner, organization, project = await _seed_owner_and_project(
        db, org_slug="alert-viewer", project_slug="alpha"
    )
    viewer = await _add_member(db, organization_id=organization.id, role=OrganizationRole.VIEWER)

    response = await client.post(
        f"/api/v1/projects/{project.id}/alert-rules",
        json={"name": "Nope", "metric": "failure_rate", "threshold": 10},
        headers=await _authorization_header(viewer, db, mock_redis),
    )

    assert response.status_code == 403


async def test_owner_can_create_an_alert_rule_scoped_to_the_project(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="alert-create", project_slug="beta"
    )

    response = await client.post(
        f"/api/v1/projects/{project.id}/alert-rules",
        json={
            "name": "High failure rate",
            "metric": "failure_rate",
            "threshold": 10,
            "window_minutes": 30,
            "notify_email": "oncall@example.com",
        },
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["project_id"] == str(project.id)
    assert data["metric"] == "failure_rate"
    assert data["window_minutes"] == 30
    assert data["last_triggered_at"] is None


async def test_list_excludes_other_projects_rules(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _organization, project_a = await _seed_owner_and_project(
        db, org_slug="alert-list-a", project_slug="gamma"
    )
    _owner_b, _organization_b, project_b = await _seed_owner_and_project(
        db, org_slug="alert-list-b", project_slug="delta"
    )
    db.add_all(
        [
            AlertRule(project_id=project_a.id, name="A rule", metric="failure_rate", threshold=5),
            AlertRule(project_id=project_b.id, name="B rule", metric="failure_rate", threshold=5),
        ]
    )
    await db.commit()

    response = await client.get(
        f"/api/v1/projects/{project_a.id}/alert-rules",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["name"] for item in items] == ["A rule"]


async def test_another_projects_admin_cannot_update_this_projects_rule(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    _owner_a, _organization_a, project_a = await _seed_owner_and_project(
        db, org_slug="alert-upd-a", project_slug="epsilon"
    )
    owner_b, _organization_b, project_b = await _seed_owner_and_project(
        db, org_slug="alert-upd-b", project_slug="zeta"
    )
    rule = AlertRule(
        project_id=project_a.id, name="Epsilon rule", metric="failure_rate", threshold=5
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    response = await client.put(
        f"/api/v1/projects/{project_b.id}/alert-rules/{rule.id}",
        json={"threshold": 999},
        headers=await _authorization_header(owner_b, db, mock_redis),
    )

    assert response.status_code == 404


async def test_delete_removes_the_rule(client: AsyncClient, db: AsyncSession, mock_redis) -> None:
    owner, _organization, project = await _seed_owner_and_project(
        db, org_slug="alert-del", project_slug="eta"
    )
    rule = AlertRule(project_id=project.id, name="Eta rule", metric="failure_rate", threshold=5)
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    response = await client.delete(
        f"/api/v1/projects/{project.id}/alert-rules/{rule.id}",
        headers=await _authorization_header(owner, db, mock_redis),
    )

    assert response.status_code == 204
    remaining = (
        await db.execute(select(AlertRule).where(AlertRule.id == rule.id))
    ).scalar_one_or_none()
    assert remaining is None
