"""Dispatcher for due scheduled events — delivery, expiry, failure and crash safety."""

import uuid
from collections.abc import Iterator
from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime import utc_now
from app.modules.credentials.model import ApiKey
from app.modules.events.enums import EventPriority, EventStatus, ScheduledEventStatus
from app.modules.events.model import Event
from app.modules.events.scheduled.model import ScheduledEvent
from app.modules.events.scheduled.task import (
    dispatch_due_events,
    idempotency_key_for,
)
from app.modules.notifications.model import Notification
from tests.conftest import TestSessionLocal


@pytest.fixture(autouse=True)
def _no_redis() -> Iterator[None]:
    redis = AsyncMock()
    redis.get.return_value = None
    with patch("app.modules.events.idempotency.get_redis", return_value=redis):
        yield


def _payload(**overrides) -> dict:
    base = {
        "event_type": "renewal.reminder",
        "recipients": [{"channels": ["email"], "email": "alex@example.com"}],
        "inline": {"subject": "Renewal", "html": "<p>Renews soon</p>"},
        "payload": {"plan": "pro"},
    }
    base.update(overrides)
    return base


async def _schedule(
    db: AsyncSession,
    key: ApiKey,
    *,
    due_in: timedelta = timedelta(minutes=-1),
    status: ScheduledEventStatus = ScheduledEventStatus.PENDING,
    payload: dict | None = None,
) -> ScheduledEvent:
    row = ScheduledEvent(
        api_key_id=key.id,
        payload=payload or _payload(),
        scheduled_for=utc_now() + due_in,
        priority=EventPriority.HIGH,
        status=status,
    )
    db.add(row)
    await db.commit()
    return row


async def _reload(db: AsyncSession, row: ScheduledEvent) -> ScheduledEvent:
    await db.refresh(row)
    return row


async def _count(db: AsyncSession, model) -> int:
    return int((await db.execute(select(func.count()).select_from(model))).scalar() or 0)


@pytest.mark.asyncio
async def test_due_event_creates_event_and_is_dispatched(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    row = await _schedule(db, key)
    enqueue = MagicMock()

    result = await dispatch_due_events(TestSessionLocal, enqueue=enqueue)

    assert result.dispatched == 1
    row = await _reload(db, row)
    assert row.status == ScheduledEventStatus.DISPATCHED
    assert row.event_id is not None
    event = await db.get(Event, row.event_id)
    assert event is not None
    assert event.api_key_id == key.id
    assert event.priority == EventPriority.HIGH
    assert event.idempotency_key == idempotency_key_for(row.id)
    assert event.inline_content["subject"] == "Renewal"
    assert await _count(db, Notification) == 1
    enqueue.assert_called_once_with(str(event.id), "high")


@pytest.mark.asyncio
async def test_attachments_survive_the_round_trip(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    attachment = {"filename": "a.pdf", "url": "https://files.example.com/a.pdf", "size_bytes": 10}
    row = await _schedule(db, key, payload=_payload(attachments=[attachment]))

    await dispatch_due_events(TestSessionLocal, enqueue=MagicMock())

    event = await db.get(Event, (await _reload(db, row)).event_id)
    assert event is not None
    assert event.attachments == [attachment]


@pytest.mark.asyncio
async def test_future_event_is_left_alone(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    row = await _schedule(db, key, due_in=timedelta(hours=1))

    result = await dispatch_due_events(TestSessionLocal, enqueue=MagicMock())

    assert result.dispatched == 0
    assert (await _reload(db, row)).status == ScheduledEventStatus.PENDING
    assert await _count(db, Event) == 0


@pytest.mark.asyncio
async def test_event_past_grace_period_expires_without_sending(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    row = await _schedule(db, key, due_in=timedelta(hours=-2))
    enqueue = MagicMock()

    result = await dispatch_due_events(TestSessionLocal, enqueue=enqueue)

    assert result.expired == 1
    assert (await _reload(db, row)).status == ScheduledEventStatus.EXPIRED
    assert await _count(db, Event) == 0
    enqueue.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status",
    [
        ScheduledEventStatus.CANCELLED,
        ScheduledEventStatus.DISPATCHED,
        ScheduledEventStatus.FAILED,
        ScheduledEventStatus.PROCESSING,
    ],
)
async def test_non_pending_rows_are_never_dispatched(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str], status: ScheduledEventStatus
) -> None:
    key, _ = api_key_pair
    row = await _schedule(db, key, status=status)

    await dispatch_due_events(TestSessionLocal, enqueue=MagicMock())

    assert (await _reload(db, row)).status == status
    assert await _count(db, Event) == 0


@pytest.mark.asyncio
async def test_second_sweep_does_not_resend(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    await _schedule(db, key)
    enqueue = MagicMock()

    await dispatch_due_events(TestSessionLocal, enqueue=enqueue)
    await dispatch_due_events(TestSessionLocal, enqueue=enqueue)

    assert await _count(db, Event) == 1
    assert enqueue.call_count == 1


@pytest.mark.asyncio
async def test_event_committed_before_a_crash_is_adopted_not_duplicated(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    """An Event already exists for the row's key (earlier attempt died before the row update)."""
    key, _ = api_key_pair
    row = await _schedule(db, key)
    orphan = Event(
        event_type="renewal.reminder",
        priority=EventPriority.HIGH,
        status=EventStatus.ACCEPTED,
        inline_content={"html": "<p>x</p>"},
        payload={},
        api_key_id=key.id,
        idempotency_key=idempotency_key_for(row.id),
        recipient_count=1,
    )
    db.add(orphan)
    await db.commit()
    enqueue = MagicMock()

    result = await dispatch_due_events(TestSessionLocal, enqueue=enqueue)

    assert result.dispatched == 1
    row = await _reload(db, row)
    assert row.status == ScheduledEventStatus.DISPATCHED
    assert row.event_id == orphan.id
    assert await _count(db, Event) == 1
    # It never started processing, so it is nudged exactly once.
    enqueue.assert_called_once_with(str(orphan.id), "high")


@pytest.mark.asyncio
async def test_unknown_template_fails_permanently(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    payload = _payload(template_name="deleted-since")
    del payload["inline"]
    row = await _schedule(db, key, payload=payload)

    result = await dispatch_due_events(TestSessionLocal, enqueue=MagicMock())

    assert result.failed == 1
    assert (await _reload(db, row)).status == ScheduledEventStatus.FAILED
    assert await _count(db, Event) == 0


@pytest.mark.asyncio
async def test_row_without_a_content_source_fails(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    """Rows created before content sources were validated carry no template or inline body."""
    key, _ = api_key_pair
    legacy = {
        "event_type": "x",
        "recipients": [{"channels": ["email"], "email": "a@example.com"}],
        "payload": {},
        "metadata": None,
        "template_id": None,
    }
    row = await _schedule(db, key, payload=legacy)

    result = await dispatch_due_events(TestSessionLocal, enqueue=MagicMock())

    assert result.failed == 1
    assert (await _reload(db, row)).status == ScheduledEventStatus.FAILED


@pytest.mark.asyncio
async def test_transient_error_leaves_row_pending_and_creates_nothing(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    row = await _schedule(db, key)

    with patch(
        "app.modules.events.scheduled.task.create_event", side_effect=RuntimeError("db down")
    ):
        result = await dispatch_due_events(TestSessionLocal, enqueue=MagicMock())

    assert result.retry == 1
    assert (await _reload(db, row)).status == ScheduledEventStatus.PENDING
    assert await _count(db, Event) == 0


@pytest.mark.asyncio
async def test_one_bad_row_does_not_block_the_rest(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    bad = _payload(recipients=[{"channels": ["email"]}])
    bad_row = await _schedule(db, key, due_in=timedelta(minutes=-5), payload=bad)
    good_row = await _schedule(db, key, due_in=timedelta(minutes=-1))

    result = await dispatch_due_events(TestSessionLocal, enqueue=MagicMock())

    assert (result.failed, result.dispatched) == (1, 1)
    assert (await _reload(db, bad_row)).status == ScheduledEventStatus.FAILED
    assert (await _reload(db, good_row)).status == ScheduledEventStatus.DISPATCHED


@pytest.mark.asyncio
async def test_enqueue_failure_still_marks_dispatched(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    row = await _schedule(db, key)

    result = await dispatch_due_events(
        TestSessionLocal, enqueue=MagicMock(side_effect=RuntimeError("broker down"))
    )

    assert result.dispatched == 1
    row = await _reload(db, row)
    assert row.status == ScheduledEventStatus.DISPATCHED
    assert row.event_id is not None


@pytest.mark.asyncio
async def test_each_scheduled_row_gets_its_own_idempotency_key(
    db: AsyncSession, api_key_pair: tuple[ApiKey, str]
) -> None:
    key, _ = api_key_pair
    await _schedule(db, key)
    await _schedule(db, key)

    await dispatch_due_events(TestSessionLocal, enqueue=MagicMock())

    keys = (await db.execute(select(Event.idempotency_key))).scalars().all()
    assert len(set(keys)) == 2
    assert all(k and k.startswith("scheduled:") for k in keys)


def test_idempotency_key_is_stable() -> None:
    sid = uuid.uuid4()
    assert idempotency_key_for(sid) == idempotency_key_for(sid) == f"scheduled:{sid}"
