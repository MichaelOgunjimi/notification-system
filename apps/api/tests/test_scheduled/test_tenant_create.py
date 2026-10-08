"""Dashboard scheduling (POST /projects/{id}/scheduled-events) and displayed-status filters."""

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.credentials.model import ApiKey
from app.modules.events.enums import EventStatus, ScheduledEventStatus
from app.modules.events.enums import ScheduledEventStatus as Stored
from app.modules.events.model import Event
from app.modules.events.scheduled.display import (
    ScheduledDisplayStatus,
    display_status,
    display_status_clause,
)
from app.modules.events.scheduled.model import ScheduledEvent
from app.modules.identity.models.user import User
from app.modules.observability.audit.model import AuditLog
from app.modules.observability.usage.model import ApiKeyUsage
from app.modules.tenancy.lifecycle import create_organization, create_project
from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole
from tests.test_scheduled.test_tenant import _auth, _payload, _schedule, _seed_project


def _body(key: ApiKey, **overrides) -> dict:
    base = {
        "api_key_id": str(key.id),
        "event_type": "renewal.reminder",
        "recipients": [{"channels": ["email"], "email": "a@example.com"}],
        "inline": {"subject": "Renewal", "html": "<p>Soon</p>"},
        "payload": {"plan": "pro"},
        "scheduled_for": (utc_now() + timedelta(hours=2)).isoformat() + "Z",
    }
    base.update(overrides)
    return base


def _url(project_id: uuid.UUID) -> str:
    return f"/api/v1/projects/{project_id}/scheduled-events"


async def test_create_is_owned_by_the_chosen_key_and_returns_detail(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="cr-a")

    response = await client.post(
        _url(project.id),
        json=_body(key, priority="high"),
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["api_key_id"] == str(key.id)
    assert body["api_key_name"] == "cr-a key"
    assert body["status"] == "pending"
    assert body["display_status"] == "pending"
    assert body["priority"] == "high"
    assert body["subject"] == "Renewal"
    row = await db.get(ScheduledEvent, body["id"])
    assert row is not None
    assert row.api_key_id == key.id
    assert "api_key_id" not in row.payload  # the dashboard-only field is not stored as content


async def test_create_stores_exactly_what_the_public_endpoint_stores(
    client: AsyncClient, auth_client: AsyncClient, db: AsyncSession, mock_redis, api_key_pair
) -> None:
    """Same service, same validation: identical content produces an identical stored payload."""
    public_key, _raw = api_key_pair
    owner, _org, project, key = await _seed_project(db, slug="cr-p")
    content = {
        "event_type": "renewal.reminder",
        "recipients": [{"channels": ["email"], "email": "a@example.com"}],
        "inline": {"subject": "Renewal", "html": "<p>Soon</p>"},
        "payload": {"plan": "pro"},
        "scheduled_for": (utc_now() + timedelta(hours=2)).isoformat() + "Z",
    }

    via_api = await auth_client.post("/api/v1/scheduled-events", json=content)
    via_dashboard = await client.post(
        _url(project.id),
        json={**content, "api_key_id": str(key.id)},
        headers=await _auth(owner, db, mock_redis),
    )

    assert via_api.status_code == via_dashboard.status_code == 201
    a = await db.get(ScheduledEvent, via_api.json()["id"])
    b = await db.get(ScheduledEvent, via_dashboard.json()["id"])
    assert a is not None and b is not None
    assert a.payload == b.payload
    assert a.scheduled_for == b.scheduled_for
    assert public_key.id != key.id


@pytest.mark.parametrize("offset", ["+00:00", "+01:00", "-05:00"])
async def test_create_normalises_offset_timestamps_to_utc(
    client: AsyncClient, db: AsyncSession, mock_redis, offset: str
) -> None:
    owner, _org, project, key = await _seed_project(db, slug=f"cr-t{abs(int(offset[:3]))}")
    hours = int(offset[:3])
    local = (utc_now() + timedelta(hours=3) + timedelta(hours=hours)).replace(microsecond=0)

    response = await client.post(
        _url(project.id),
        json=_body(key, scheduled_for=local.isoformat() + offset),
        headers=await _auth(owner, db, mock_redis),
    )

    assert response.status_code == 201
    row = await db.get(ScheduledEvent, response.json()["id"])
    assert row is not None
    assert row.scheduled_for == local - timedelta(hours=hours)


async def test_create_records_who_and_which_key_in_the_audit_log_and_marks_the_key_used(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="cr-u")

    response = await client.post(
        _url(project.id), json=_body(key), headers=await _auth(owner, db, mock_redis)
    )

    sid = response.json()["id"]
    entry = (
        await db.execute(select(AuditLog).where(AuditLog.action == "scheduled_event.created"))
    ).scalar_one()
    assert entry.resource_id == sid
    assert entry.actor_user_id == owner.id
    assert entry.api_key_id == key.id
    assert entry.project_id == project.id
    assert entry.metadata_["via"] == "dashboard"
    assert entry.metadata_["api_key_prefix"] == key.key_prefix
    await db.refresh(key)
    assert key.last_used_at is not None


async def test_create_attributes_usage_to_the_key(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="cr-s")

    await client.post(_url(project.id), json=_body(key), headers=await _auth(owner, db, mock_redis))

    usage = (
        (await db.execute(select(ApiKeyUsage).where(ApiKeyUsage.api_key_id == key.id)))
        .scalars()
        .all()
    )
    assert [(u.method, u.status_code) for u in usage] == [("POST", 201)]


async def test_create_validation_errors_come_back_as_422(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="cr-v")
    headers = await _auth(owner, db, mock_redis)
    no_content = _body(key)
    del no_content["inline"]

    assert (
        await client.post(_url(project.id), json=no_content, headers=headers)
    ).status_code == 422
    unknown_template = {**no_content, "template_name": "nope"}
    resp = await client.post(_url(project.id), json=unknown_template, headers=headers)
    assert resp.status_code == 422
    assert "nope" in str(resp.json())
    missing_address = _body(key, recipients=[{"channels": ["sms"]}])
    assert (
        await client.post(_url(project.id), json=missing_address, headers=headers)
    ).status_code == 422
    past = _body(key, scheduled_for=(utc_now() - timedelta(hours=1)).isoformat() + "Z")
    assert (await client.post(_url(project.id), json=past, headers=headers)).status_code == 422
    assert (await db.execute(select(ScheduledEvent))).first() is None


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"is_active": False}, "revoked or inactive"),
        ({"revoked_at": utc_now()}, "revoked or inactive"),
        ({"scopes": ["events:write"]}, "scheduled_events:write"),
    ],
)
async def test_create_rejects_unusable_keys(
    client: AsyncClient, db: AsyncSession, mock_redis, change: dict, message: str
) -> None:
    owner, _org, project, key = await _seed_project(db, slug=f"cr-k{len(change)}{message[:3]}")
    for field, value in change.items():
        setattr(key, field, value)
    await db.commit()

    response = await client.post(
        _url(project.id), json=_body(key), headers=await _auth(owner, db, mock_redis)
    )

    assert response.status_code == 422
    assert message in str(response.json())
    assert (await db.execute(select(ScheduledEvent))).first() is None


async def test_create_rejects_a_key_from_another_project_or_unknown(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner_a, _org, project_a, _key_a = await _seed_project(db, slug="cr-x1")
    _owner_b, _org_b, _project_b, key_b = await _seed_project(db, slug="cr-x2")
    headers = await _auth(owner_a, db, mock_redis)

    foreign = await client.post(_url(project_a.id), json=_body(key_b), headers=headers)
    unknown = await client.post(
        _url(project_a.id), json={**_body(key_b), "api_key_id": str(uuid.uuid4())}, headers=headers
    )

    assert foreign.status_code == unknown.status_code == 422
    assert "not found in this project" in str(foreign.json())
    assert (await db.execute(select(ScheduledEvent))).first() is None


async def test_create_needs_the_manage_capability(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    _owner, organization, project, key = await _seed_project(db, slug="cr-m")
    member = User(email="member-cr@example.com", name="Member")
    db.add(member)
    await db.flush()
    db.add(
        OrganizationMembership(
            organization_id=organization.id, user_id=member.id, role=OrganizationRole.MEMBER
        )
    )
    await db.commit()

    response = await client.post(
        _url(project.id), json=_body(key), headers=await _auth(member, db, mock_redis)
    )

    assert response.status_code == 403
    assert (await db.execute(select(ScheduledEvent))).first() is None


async def test_create_shares_the_keys_rate_limit_bucket(
    client: AsyncClient, db: AsyncSession, mock_redis, monkeypatch
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="cr-r")
    monkeypatch.setattr(settings, "RATE_LIMIT_DEFAULT", 1)
    seen: list[str] = []
    counts = iter([1, 2])

    class _Redis:
        async def eval(self, _script, _n, bucket, _ttl):
            seen.append(bucket)
            return next(counts)

    headers = await _auth(owner, db, mock_redis)
    with patch("app.core.http.rate_limit.get_redis", return_value=_Redis()):
        first = await client.post(_url(project.id), json=_body(key), headers=headers)
        second = await client.post(_url(project.id), json=_body(key), headers=headers)

    assert first.status_code == 201
    assert second.status_code == 429
    assert second.headers["Retry-After"]
    # The bucket is the one header-authenticated traffic for this key uses.
    assert all(b.startswith(f"rl:{key.key_hash}:general:") for b in seen)
    assert len((await db.execute(select(ScheduledEvent))).scalars().all()) == 1


# --- displayed-status filters and ordering ---------------------------------------------


async def _event(db: AsyncSession, key: ApiKey, status: EventStatus) -> Event:
    event = Event(event_type="x", status=status, payload={}, api_key_id=key.id, recipient_count=1)
    db.add(event)
    await db.commit()
    return event


async def _seed_every_displayed_status(db: AsyncSession, key: ApiKey) -> None:
    for stored, event_status in [
        (Stored.PENDING, None),
        (Stored.PROCESSING, None),
        (Stored.FAILED, None),
        (Stored.EXPIRED, None),
        (Stored.CANCELLED, None),
        (Stored.DISPATCHED, None),
        (Stored.DISPATCHED, EventStatus.ACCEPTED),
        (Stored.DISPATCHED, EventStatus.PROCESSING),
        (Stored.DISPATCHED, EventStatus.CANCELLED),
        (Stored.DISPATCHED, EventStatus.COMPLETED),
        (Stored.DISPATCHED, EventStatus.PARTIALLY_FAILED),
        (Stored.DISPATCHED, EventStatus.FAILED),
    ]:
        event = await _event(db, key, event_status) if event_status else None
        await _schedule(db, key, status=stored, event_id=event.id if event else None)


@pytest.mark.parametrize("wanted", list(ScheduledDisplayStatus))
async def test_filter_returns_only_rows_labelled_with_that_status(
    client: AsyncClient, db: AsyncSession, mock_redis, wanted: ScheduledDisplayStatus
) -> None:
    owner, _org, project, key = await _seed_project(db, slug=f"fl-{wanted.value[:6]}")
    await _seed_every_displayed_status(db, key)

    response = await client.get(
        _url(project.id),
        params={"status": wanted.value, "per_page": 100},
        headers=await _auth(owner, db, mock_redis),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["total"] == len(body["items"]) > 0
    assert {item["display_status"] for item in body["items"]} == {wanted.value}


async def test_every_row_appears_under_exactly_one_filter(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="fl-all")
    await _seed_every_displayed_status(db, key)
    headers = await _auth(owner, db, mock_redis)

    everything = (
        await client.get(_url(project.id), params={"per_page": 100}, headers=headers)
    ).json()
    seen: list[str] = []
    for status in ScheduledDisplayStatus:
        page = (
            await client.get(
                _url(project.id), params={"status": status.value, "per_page": 100}, headers=headers
            )
        ).json()
        seen += [item["id"] for item in page["items"]]

    assert everything["total"] == 12
    assert sorted(seen) == sorted(item["id"] for item in everything["items"])


async def test_filter_paginates_on_the_server(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="fl-pg")
    for _ in range(3):
        await _schedule(
            db,
            key,
            status=ScheduledEventStatus.DISPATCHED,
            event_id=(await _event(db, key, EventStatus.COMPLETED)).id,
        )
    await _schedule(db, key, status=ScheduledEventStatus.DISPATCHED)
    headers = await _auth(owner, db, mock_redis)

    page = (
        await client.get(
            _url(project.id),
            params={"status": "completed", "per_page": 2, "page": 2},
            headers=headers,
        )
    ).json()

    assert (page["total"], page["total_pages"], len(page["items"])) == (3, 2, 1)


async def test_display_status_function_agrees_with_the_sql_clause(db: AsyncSession) -> None:
    """The label and the filter come from one definition; prove they cannot drift."""
    owner = User(email="agree@example.com", name="O")
    db.add(owner)
    await db.commit()
    organization = await create_organization(db, owner=owner, name="ag", slug="ag")
    project = await create_project(
        db, organization=organization, creator=owner, name="ag", slug="ag"
    )
    key = ApiKey(
        project_id=project.id,
        created_by_user_id=owner.id,
        key_hash="ag-hash",
        key_prefix="agpre00000",
        name="k",
    )
    db.add(key)
    await db.commit()
    await _seed_every_displayed_status(db, key)

    for wanted in ScheduledDisplayStatus:
        rows = (
            await db.execute(
                select(ScheduledEvent.status, Event.status)
                .select_from(ScheduledEvent)
                .outerjoin(Event, Event.id == ScheduledEvent.event_id)
                .where(display_status_clause(wanted))
            )
        ).all()
        assert rows, wanted
        assert {display_status(stored, event) for stored, event in rows} == {wanted}


async def test_pending_reads_soonest_first_and_everything_else_latest_first(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner, _org, project, key = await _seed_project(db, slug="so-a")
    headers = await _auth(owner, db, mock_redis)
    for hours in (5, 1, 3):
        await _schedule(
            db, key, due_in=timedelta(hours=hours), payload=_payload(event_type=f"p{hours}")
        )
    for hours in (2, 6, 4):
        await _schedule(
            db,
            key,
            status=ScheduledEventStatus.CANCELLED,
            due_in=timedelta(hours=hours),
            payload=_payload(event_type=f"c{hours}"),
        )

    def order(page: dict) -> list[str]:
        return [item["event_type"] for item in page["items"]]

    pending = (
        await client.get(_url(project.id), params={"status": "pending"}, headers=headers)
    ).json()
    cancelled = (
        await client.get(_url(project.id), params={"status": "cancelled"}, headers=headers)
    ).json()
    everything = (await client.get(_url(project.id), headers=headers)).json()

    assert order(pending) == ["p1", "p3", "p5"]
    assert order(cancelled) == ["c6", "c4", "c2"]
    assert order(everything)[:2] == ["c6", "p5"]
