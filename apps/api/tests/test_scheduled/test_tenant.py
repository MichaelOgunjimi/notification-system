"""Session-auth, project-scoped scheduled event endpoints (the dashboard's view)."""

import uuid
from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime import utc_now
from app.modules.credentials.model import ApiKey
from app.modules.events.enums import EventPriority, EventStatus, ScheduledEventStatus
from app.modules.events.model import Event
from app.modules.events.scheduled.model import ScheduledEvent
from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens
from app.modules.tenancy.lifecycle import create_organization, create_project
from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole


async def _auth(user: User, db: AsyncSession, mock_redis) -> dict[str, str]:
    tokens = await create_user_tokens(user, db, mock_redis)
    return {"Authorization": f"Bearer {tokens.access_token}"}


async def _seed_project(db: AsyncSession, *, slug: str):
    owner = User(email=f"{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name=slug, slug=slug)
    project = await create_project(
        db, organization=organization, creator=owner, name=slug, slug=slug
    )
    key = ApiKey(
        project_id=project.id,
        created_by_user_id=owner.id,
        key_hash=f"{slug}-hash"[:60],
        key_prefix=f"{slug}pre"[:10].ljust(10, "x"),
        name=f"{slug} key",
    )
    db.add(key)
    await db.commit()
    return owner, organization, project, key


def _payload(**overrides) -> dict:
    base = {
        "event_type": "renewal.reminder",
        "recipients": [
            {
                "user_id": "u1",
                "channels": ["email", "sms"],
                "email": "a@example.com",
                "phone": "+15551234567",
            },
            {"channels": ["email"], "email": "b@example.com"},
        ],
        "inline": {"subject": "Renewal", "html": "<p>Soon</p>"},
        "attachments": [
            {"filename": "a.pdf", "url": "https://files.example.com/secret.pdf", "size_bytes": 10}
        ],
        "payload": {"plan": "pro"},
        "metadata": {"source": "test"},
    }
    base.update(overrides)
    return base


async def _schedule(
    db: AsyncSession,
    key: ApiKey,
    *,
    status: ScheduledEventStatus = ScheduledEventStatus.PENDING,
    due_in: timedelta = timedelta(hours=1),
    payload: dict | None = None,
    failure_reason: str | None = None,
    event_id: uuid.UUID | None = None,
) -> ScheduledEvent:
    row = ScheduledEvent(
        api_key_id=key.id,
        payload=payload or _payload(),
        scheduled_for=utc_now() + due_in,
        priority=EventPriority.HIGH,
        status=status,
        failure_reason=failure_reason,
        event_id=event_id,
    )
    db.add(row)
    await db.commit()
    return row


async def test_list_is_scoped_to_the_project_and_summarises_rows(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner_a, _org, project_a, key_a = await _seed_project(db, slug="se-a")
    _owner_b, _org_b, _project_b, key_b = await _seed_project(db, slug="se-b")
    await _schedule(db, key_a)
    await _schedule(db, key_b)

    response = await client.get(
        f"/api/v1/projects/{project_a.id}/scheduled-events",
        headers=await _auth(owner_a, db, mock_redis),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["event_type"] == "renewal.reminder"
    assert item["status"] == "pending"
    assert item["api_key_name"] == "se-a key"
    assert item["content_source"] == "inline"
    assert item["recipient_count"] == 2
    assert item["channels"] == ["email", "sms"]
    assert item["first_recipient"] == "a@example.com"
    assert item["event_status"] is None


async def test_list_filters_by_status_and_shows_failure_reason(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="se-f")
    await _schedule(db, key)
    await _schedule(
        db,
        key,
        status=ScheduledEventStatus.FAILED,
        failure_reason="Template with name 'x' not found",
    )

    response = await client.get(
        f"/api/v1/projects/{project.id}/scheduled-events",
        params={"status": "failed"},
        headers=await _auth(owner, db, mock_redis),
    )

    items = response.json()["items"]
    assert [i["status"] for i in items] == ["failed"]
    assert items[0]["failure_reason"] == "Template with name 'x' not found"


async def test_dispatched_row_reports_the_linked_events_status(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="se-d")
    event = Event(
        event_type="renewal.reminder",
        status=EventStatus.COMPLETED,
        payload={},
        api_key_id=key.id,
        recipient_count=1,
    )
    db.add(event)
    await db.commit()
    await _schedule(db, key, status=ScheduledEventStatus.DISPATCHED, event_id=event.id)

    response = await client.get(
        f"/api/v1/projects/{project.id}/scheduled-events",
        headers=await _auth(owner, db, mock_redis),
    )

    item = response.json()["items"][0]
    assert item["status"] == "dispatched"
    assert item["event_id"] == str(event.id)
    assert item["event_status"] == "completed"


async def test_detail_lists_recipients_and_attachments_without_urls(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="se-x")
    row = await _schedule(db, key)

    response = await client.get(
        f"/api/v1/projects/{project.id}/scheduled-events/{row.id}",
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["subject"] == "Renewal"
    assert body["recipients"][0] == {
        "user_id": "u1",
        "channels": ["email", "sms"],
        "addresses": ["a@example.com", "+15551234567"],
    }
    assert body["attachments"] == [{"filename": "a.pdf", "size_bytes": 10}]
    assert "secret.pdf" not in response.text
    assert body["payload"] == {"plan": "pro"}


async def test_template_backed_row_reports_its_template(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="se-t")
    payload = _payload(template_name="renewal")
    del payload["inline"]
    row = await _schedule(db, key, payload=payload)

    body = (
        await client.get(
            f"/api/v1/projects/{project.id}/scheduled-events/{row.id}",
            headers=await _auth(owner, db, mock_redis),
        )
    ).json()

    assert body["content_source"] == "template"
    assert body["template_name"] == "renewal"
    assert body["subject"] is None


async def test_detail_404s_for_another_projects_row(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner_a, _org, project_a, _key_a = await _seed_project(db, slug="se-n1")
    _owner_b, _org_b, _project_b, key_b = await _seed_project(db, slug="se-n2")
    row = await _schedule(db, key_b)

    response = await client.get(
        f"/api/v1/projects/{project_a.id}/scheduled-events/{row.id}",
        headers=await _auth(owner_a, db, mock_redis),
    )

    assert response.status_code == 404


async def test_non_members_cannot_list(client: AsyncClient, db: AsyncSession, mock_redis) -> None:
    _owner_a, _org, project_a, _key = await _seed_project(db, slug="se-m1")
    owner_b, _org_b, _project_b, _key_b = await _seed_project(db, slug="se-m2")

    response = await client.get(
        f"/api/v1/projects/{project_a.id}/scheduled-events",
        headers=await _auth(owner_b, db, mock_redis),
    )

    assert response.status_code in {403, 404}


async def test_cancel_pending_then_repeat_is_a_no_op(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="se-c")
    row = await _schedule(db, key)
    headers = await _auth(owner, db, mock_redis)
    url = f"/api/v1/projects/{project.id}/scheduled-events/{row.id}"

    assert (await client.delete(url, headers=headers)).status_code == 204
    assert (await client.delete(url, headers=headers)).status_code == 204

    await db.refresh(row)
    assert row.status == ScheduledEventStatus.CANCELLED


async def test_cancel_conflicts_once_dispatched(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="se-k")
    row = await _schedule(db, key, status=ScheduledEventStatus.DISPATCHED)

    response = await client.delete(
        f"/api/v1/projects/{project.id}/scheduled-events/{row.id}",
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 409
    await db.refresh(row)
    assert row.status == ScheduledEventStatus.DISPATCHED


async def test_members_can_read_but_not_cancel(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    _owner, organization, project, key = await _seed_project(db, slug="se-r")
    member = User(email="member-se@example.com", name="Member")
    db.add(member)
    await db.flush()
    db.add(
        OrganizationMembership(
            organization_id=organization.id, user_id=member.id, role=OrganizationRole.MEMBER
        )
    )
    await db.commit()
    row = await _schedule(db, key)
    headers = await _auth(member, db, mock_redis)
    base = f"/api/v1/projects/{project.id}/scheduled-events"

    assert (await client.get(base, headers=headers)).status_code == 200
    assert (await client.delete(f"{base}/{row.id}", headers=headers)).status_code == 403
    await db.refresh(row)
    assert row.status == ScheduledEventStatus.PENDING
