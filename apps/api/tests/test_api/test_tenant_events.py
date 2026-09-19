"""Session-auth, project/organization-scoped event endpoints."""

import uuid
from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.credentials.model import ApiKey
from app.modules.events.enums import EventPriority, EventStatus
from app.modules.events.model import Event
from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.notifications.log_model import NotificationLog
from app.modules.notifications.model import Notification
from app.modules.tenancy.lifecycle import create_organization, create_project


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
    await db.flush()
    await db.commit()
    return owner, organization, project, key


async def _seed_event(
    db: AsyncSession,
    key: ApiKey,
    *,
    event_type: str = "test.happened",
    status: EventStatus = EventStatus.COMPLETED,
    priority: EventPriority = EventPriority.MEDIUM,
    with_failed_notification: bool = False,
) -> Event:
    now = datetime.now(UTC).replace(tzinfo=None)
    event = Event(
        id=uuid.uuid4(),
        event_type=event_type,
        priority=priority,
        status=status,
        payload={"hello": "world"},
        api_key_id=key.id,
        recipient_count=1,
        created_at=now,
        updated_at=now,
    )
    db.add(event)
    await db.flush()
    db.add(
        Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel=NotificationChannel.EMAIL,
            recipient_user_id="u1",
            recipient_address="u1@test.com",
            status=NotificationStatus.FAILED
            if with_failed_notification
            else NotificationStatus.DELIVERED,
            error_message="bounced" if with_failed_notification else None,
            created_at=now,
            updated_at=now,
        )
    )
    await db.commit()
    return event


async def test_project_events_lists_only_this_projects_events(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner_a, _org_a, project_a, key_a = await _seed_project(db, slug="ev-a")
    _owner_b, _org_b, _project_b, key_b = await _seed_project(db, slug="ev-b")
    await _seed_event(db, key_a, event_type="a.thing")
    await _seed_event(db, key_b, event_type="b.thing")

    response = await client.get(
        f"/api/v1/projects/{project_a.id}/events",
        headers=await _auth(owner_a, db, mock_redis),
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["event_type"] for item in items] == ["a.thing"]
    assert items[0]["api_key_name"] == "ev-a key"


async def test_project_events_filters_by_status_and_priority(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="ev-filter")
    await _seed_event(db, key, event_type="done", status=EventStatus.COMPLETED)
    await _seed_event(
        db, key, event_type="broke", status=EventStatus.FAILED, priority=EventPriority.HIGH
    )

    response = await client.get(
        f"/api/v1/projects/{project.id}/events",
        params={"status": "failed", "priority": "high"},
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["event_type"] for item in items] == ["broke"]


async def test_project_events_flags_events_with_failed_notifications(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="ev-fail")
    await _seed_event(db, key, event_type="clean")
    await _seed_event(db, key, event_type="partial", with_failed_notification=True)

    response = await client.get(
        f"/api/v1/projects/{project.id}/events",
        headers=await _auth(owner, db, mock_redis),
    )

    by_type = {item["event_type"]: item["has_failures"] for item in response.json()["items"]}
    assert by_type == {"clean": False, "partial": True}


async def test_organization_events_span_every_project(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner = User(email="ev-org@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    organization = await create_organization(db, owner=owner, name="EvOrg", slug="ev-org")
    project_a = await create_project(
        db, organization=organization, creator=owner, name="A", slug="ev-org-a"
    )
    project_b = await create_project(
        db, organization=organization, creator=owner, name="B", slug="ev-org-b"
    )
    key_a = ApiKey(
        project_id=project_a.id,
        created_by_user_id=owner.id,
        key_hash="ev-org-a-hash",
        key_prefix="evorgaxxxx",
        name="A key",
    )
    key_b = ApiKey(
        project_id=project_b.id,
        created_by_user_id=owner.id,
        key_hash="ev-org-b-hash",
        key_prefix="evorgbxxxx",
        name="B key",
    )
    db.add_all([key_a, key_b])
    await db.flush()
    await db.commit()
    await _seed_event(db, key_a, event_type="from.a")
    await _seed_event(db, key_b, event_type="from.b")

    response = await client.get(
        f"/api/v1/organizations/{organization.id}/events",
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 200
    assert {item["event_type"] for item in response.json()["items"]} == {"from.a", "from.b"}


async def test_event_detail_includes_fan_out_notifications(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="ev-detail")
    event = await _seed_event(db, key, event_type="detailed", with_failed_notification=True)

    response = await client.get(
        f"/api/v1/projects/{project.id}/events/{event.id}",
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["event_type"] == "detailed"
    assert body["payload"] == {"hello": "world"}
    assert len(body["notifications"]) == 1
    assert body["notifications"][0]["status"] == "failed"
    assert body["notifications"][0]["error_message"] == "bounced"


async def test_event_detail_404s_for_another_projects_event(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    _owner_a, _org_a, _project_a, key_a = await _seed_project(db, slug="ev-x")
    owner_b, _org_b, project_b, _key_b = await _seed_project(db, slug="ev-y")
    event = await _seed_event(db, key_a)

    response = await client.get(
        f"/api/v1/projects/{project_b.id}/events/{event.id}",
        headers=await _auth(owner_b, db, mock_redis),
    )

    assert response.status_code == 404


async def test_project_events_search_matches_type_and_id(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="ev-search")
    hit = await _seed_event(db, key, event_type="checkout.completed")
    await _seed_event(db, key, event_type="signup.done")

    by_type = await client.get(
        f"/api/v1/projects/{project.id}/events",
        params={"event_type": "checkout"},
        headers=await _auth(owner, db, mock_redis),
    )
    by_id = await client.get(
        f"/api/v1/projects/{project.id}/events",
        params={"event_type": str(hit.id)[:8]},
        headers=await _auth(owner, db, mock_redis),
    )

    assert [e["event_type"] for e in by_type.json()["items"]] == ["checkout.completed"]
    assert [e["id"] for e in by_id.json()["items"]] == [str(hit.id)]


async def test_project_notifications_are_scoped_and_searchable(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner_a, _org_a, project_a, key_a = await _seed_project(db, slug="delivery-a")
    _owner_b, _org_b, _project_b, key_b = await _seed_project(db, slug="delivery-b")
    event_a = await _seed_event(db, key_a, event_type="invoice.ready")
    await _seed_event(db, key_b, event_type="private.event")

    response = await client.get(
        f"/api/v1/projects/{project_a.id}/notifications",
        params={"search": "invoice"},
        headers=await _auth(owner_a, db, mock_redis),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["event_id"] == str(event_a.id)
    assert body["items"][0]["event_type"] == "invoice.ready"


async def test_project_notifications_filters_by_multiple_statuses(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="delivery-issues")
    await _seed_event(db, key, event_type="ok.sent")
    await _seed_event(db, key, event_type="failed.sent", with_failed_notification=True)
    dead_event = await _seed_event(db, key, event_type="dead.sent")
    dead_notification = (
        await db.execute(select(Notification).where(Notification.event_id == dead_event.id))
    ).scalar_one()
    dead_notification.status = NotificationStatus.DEAD_LETTER
    db.add(dead_notification)
    await db.commit()

    response = await client.get(
        f"/api/v1/projects/{project.id}/notifications",
        params=[("status", "failed"), ("status", "dead_letter")],
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {item["event_type"] for item in body["items"]} == {"failed.sent", "dead.sent"}


async def test_project_notification_detail_includes_attempt_evidence(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="delivery-detail")
    event = await _seed_event(db, key, event_type="receipt.sent")
    notification = (
        await db.execute(select(Notification).where(Notification.event_id == event.id))
    ).scalar_one()
    notification.rendered_subject = "Your receipt"
    notification.rendered_body = "<p>Paid</p>"
    notification.provider_response = {"message_id": "provider-123"}
    db.add(
        NotificationLog(
            notification_id=notification.id,
            previous_status="processing",
            new_status="delivered",
            worker_id="worker-1",
            provider_response={"message_id": "provider-123"},
        )
    )
    await db.commit()

    response = await client.get(
        f"/api/v1/projects/{project.id}/notifications/{notification.id}",
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["event_type"] == "receipt.sent"
    assert body["rendered_subject"] == "Your receipt"
    assert body["provider_response"] == {"message_id": "provider-123"}
    assert body["logs"][0]["new_status"] == "delivered"
