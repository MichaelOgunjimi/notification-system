"""Scheduled event endpoints — content sources, early validation and cancellation."""

from datetime import UTC, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime import utc_now
from app.modules.events.enums import ScheduledEventStatus
from app.modules.events.scheduled.model import ScheduledEvent

URL = "/api/v1/scheduled-events"


def _body(**overrides) -> dict:
    base = {
        "event_type": "renewal.reminder",
        "recipients": [{"channels": ["email"], "email": "alex@example.com"}],
        "inline": {"subject": "Renewal", "html": "<p>Soon</p>"},
        "payload": {"plan": "pro"},
        "scheduled_for": (utc_now() + timedelta(hours=1)).isoformat(),
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_create_stores_inline_content_and_attachments(
    auth_client: AsyncClient, db: AsyncSession
) -> None:
    attachment = {"filename": "a.pdf", "url": "https://files.example.com/a.pdf", "size_bytes": 5}
    resp = await auth_client.post(URL, json=_body(attachments=[attachment], priority="high"))

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["priority"] == "high"
    assert "attachments" not in body
    stored = await db.get(ScheduledEvent, body["id"])
    assert stored is not None
    assert stored.payload["inline"]["html"] == "<p>Soon</p>"
    assert stored.payload["attachments"] == [attachment]


@pytest.mark.asyncio
@pytest.mark.parametrize("offset_hours", [0, 1, -5])
async def test_create_accepts_timezone_aware_scheduled_for(
    auth_client: AsyncClient, db: AsyncSession, offset_hours: int
) -> None:
    """SDKs send ISO strings with Z or an offset; both used to crash with a 500."""
    tz = timezone(timedelta(hours=offset_hours))
    target = (utc_now() + timedelta(hours=2)).replace(tzinfo=UTC, microsecond=0)
    resp = await auth_client.post(URL, json=_body(scheduled_for=target.astimezone(tz).isoformat()))

    assert resp.status_code == 201
    stored = await db.get(ScheduledEvent, resp.json()["id"])
    assert stored is not None
    assert stored.scheduled_for == target.replace(tzinfo=None)


@pytest.mark.asyncio
async def test_create_rejects_past_aware_scheduled_for(auth_client: AsyncClient) -> None:
    past = (utc_now() - timedelta(hours=1)).replace(tzinfo=UTC).isoformat()

    assert (await auth_client.post(URL, json=_body(scheduled_for=past))).status_code == 422


@pytest.mark.asyncio
async def test_create_requires_exactly_one_content_source(auth_client: AsyncClient) -> None:
    none = _body()
    del none["inline"]
    both = _body(template_name="welcome")

    assert (await auth_client.post(URL, json=none)).status_code == 422
    assert (await auth_client.post(URL, json=both)).status_code == 422


@pytest.mark.asyncio
async def test_create_rejects_unknown_template_name(auth_client: AsyncClient) -> None:
    body = _body(template_name="nope")
    del body["inline"]

    resp = await auth_client.post(URL, json=body)

    assert resp.status_code == 422
    assert "nope" in str(resp.json())


@pytest.mark.asyncio
async def test_create_rejects_recipient_missing_contact_field(auth_client: AsyncClient) -> None:
    resp = await auth_client.post(URL, json=_body(recipients=[{"channels": ["sms"]}]))

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_rejects_oversized_attachments(auth_client: AsyncClient) -> None:
    big = {"filename": "a.pdf", "url": "https://files.example.com/a.pdf", "size_bytes": 20_000_000}

    resp = await auth_client.post(URL, json=_body(attachments=[big, big]))

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_cancel_pending_is_idempotent(auth_client: AsyncClient, db: AsyncSession) -> None:
    created = (await auth_client.post(URL, json=_body())).json()

    assert (await auth_client.delete(f"{URL}/{created['id']}")).status_code == 204
    assert (await auth_client.delete(f"{URL}/{created['id']}")).status_code == 204

    row = await db.get(ScheduledEvent, created["id"])
    assert row is not None
    await db.refresh(row)
    assert row.status == ScheduledEventStatus.CANCELLED


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status", [ScheduledEventStatus.PROCESSING, ScheduledEventStatus.DISPATCHED]
)
async def test_cancel_claimed_event_conflicts(
    auth_client: AsyncClient, db: AsyncSession, status: ScheduledEventStatus
) -> None:
    created = (await auth_client.post(URL, json=_body())).json()
    row = await db.get(ScheduledEvent, created["id"])
    assert row is not None
    row.status = status
    await db.commit()

    assert (await auth_client.delete(f"{URL}/{created['id']}")).status_code == 409


@pytest.mark.asyncio
async def test_list_filters_by_status(auth_client: AsyncClient) -> None:
    await auth_client.post(URL, json=_body())

    pending = (await auth_client.get(URL, params={"status": "pending"})).json()
    dispatched = (await auth_client.get(URL, params={"status": "dispatched"})).json()

    assert pending["total"] == 1
    assert dispatched["total"] == 0
    assert (await auth_client.get(URL, params={"status": "scheduled"})).status_code == 422
