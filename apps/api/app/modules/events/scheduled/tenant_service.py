"""Project-scoped scheduled event queries for the dashboard.

The API-key surface in ``service.py`` is scoped to one key; these helpers are
scoped to a project (every key it owns) and read the stored ``EventCreate``
payload to summarise it without exposing attachment URLs.
"""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.datetime import utc_now
from app.core.pagination import Page
from app.modules.credentials.model import ApiKey
from app.modules.events.enums import EventStatus, ScheduledEventStatus
from app.modules.events.model import Event
from app.modules.events.scheduled.display import (
    ScheduledDisplayStatus,
    display_status,
    display_status_clause,
)
from app.modules.events.scheduled.model import ScheduledEvent
from app.modules.events.scheduled.schemas import (
    TenantScheduledAttachment,
    TenantScheduledEventDetailResponse,
    TenantScheduledEventResponse,
    TenantScheduledRecipient,
)

_ADDRESS_FIELDS = {"email": "email", "sms": "phone", "webhook": "webhook_url"}


def _recipient_addresses(recipient: dict[str, Any]) -> list[str]:
    addresses: list[str] = []
    for channel in recipient.get("channels") or []:
        address = recipient.get(_ADDRESS_FIELDS.get(str(channel), ""))
        if address and address not in addresses:
            addresses.append(str(address))
    return addresses


def _summary_fields(
    row: ScheduledEvent, key: ApiKey, event_status: EventStatus | None
) -> dict[str, Any]:
    payload = row.payload or {}
    recipients = payload.get("recipients") or []
    channels: list[str] = []
    for recipient in recipients:
        for channel in recipient.get("channels") or []:
            if str(channel) not in channels:
                channels.append(str(channel))
    first = next((a for r in recipients for a in _recipient_addresses(r)), None)
    return {
        "id": row.id,
        "event_type": str(payload.get("event_type") or ""),
        "scheduled_for": row.scheduled_for,
        "priority": row.priority,
        "status": row.status,
        "display_status": display_status(row.status, event_status),
        "event_id": row.event_id,
        "event_status": event_status,
        "failure_reason": row.failure_reason,
        "api_key_id": key.id,
        "api_key_name": key.name,
        "api_key_environment": key.environment,
        "content_source": "inline" if payload.get("inline") else "template",
        "recipient_count": len(recipients),
        "channels": channels,
        "first_recipient": first,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _scoped(stmt: Any, project_id: uuid.UUID) -> Any:
    """Join a scheduled event select to its key and linked event, limited to one project."""
    return (
        stmt.select_from(ScheduledEvent)
        .join(ApiKey, col(ApiKey.id) == col(ScheduledEvent.api_key_id))
        .outerjoin(Event, col(Event.id) == col(ScheduledEvent.event_id))
        .where(col(ApiKey.project_id) == project_id)
    )


def _project_rows(project_id: uuid.UUID) -> Any:
    return _scoped(select(ScheduledEvent, ApiKey, col(Event.status)), project_id)


async def list_project_scheduled_events(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    status: ScheduledDisplayStatus | None = None,
    page: int,
    per_page: int,
) -> Page[TenantScheduledEventResponse]:
    """One page of the project's scheduled events.

    ``status`` is the displayed status (see ``display.py``), applied in SQL so every page is
    consistent. Latest scheduled time first, except the pending queue, which reads soonest first.
    """
    query = _project_rows(project_id)
    if status is not None:
        query = query.where(display_status_clause(status))
    total = int(
        (
            await db.execute(select(func.count()).select_from(query.order_by(None).subquery()))
        ).scalar()
        or 0
    )
    scheduled_for = col(ScheduledEvent.scheduled_for)
    order = (
        (scheduled_for.asc(), col(ScheduledEvent.id).asc())
        if status == ScheduledDisplayStatus.PENDING
        else (scheduled_for.desc(), col(ScheduledEvent.id).desc())
    )
    rows = (
        await db.execute(query.order_by(*order).offset((page - 1) * per_page).limit(per_page))
    ).all()
    items = [
        TenantScheduledEventResponse(**_summary_fields(row, key, event_status))
        for row, key, event_status in rows
    ]
    return Page(items=items, total=total, page=page, per_page=per_page)


async def get_project_scheduled_event(
    db: AsyncSession, *, project_id: uuid.UUID, scheduled_id: uuid.UUID
) -> TenantScheduledEventDetailResponse | None:
    result = (
        await db.execute(_project_rows(project_id).where(col(ScheduledEvent.id) == scheduled_id))
    ).first()
    if result is None:
        return None
    row, key, event_status = result
    payload = row.payload or {}
    inline = payload.get("inline") or {}
    return TenantScheduledEventDetailResponse(
        **_summary_fields(row, key, event_status),
        template_id=payload.get("template_id"),
        template_name=payload.get("template_name"),
        subject=inline.get("subject"),
        recipients=[
            TenantScheduledRecipient(
                user_id=recipient.get("user_id"),
                channels=[str(c) for c in recipient.get("channels") or []],
                addresses=_recipient_addresses(recipient),
            )
            for recipient in payload.get("recipients") or []
        ],
        attachments=[
            TenantScheduledAttachment(
                filename=str(item.get("filename", "")), size_bytes=int(item.get("size_bytes", 0))
            )
            for item in payload.get("attachments") or []
        ],
        payload=payload.get("payload") or {},
        metadata=payload.get("metadata"),
    )


async def cancel_project_scheduled_event(
    db: AsyncSession, *, project_id: uuid.UUID, scheduled_id: uuid.UUID
) -> tuple[ScheduledEvent, bool] | None:
    """Cancel a pending event. Returns ``(row, changed)``, or None if not in the project.

    The row lock serialises with the dispatcher, which claims rows with
    ``SKIP LOCKED``: either the cancel wins, or the row is already dispatched and
    the caller gets ``changed=False`` with its final status.
    """
    row = (
        await db.execute(
            select(ScheduledEvent)
            .join(ApiKey, col(ApiKey.id) == col(ScheduledEvent.api_key_id))
            .where(col(ScheduledEvent.id) == scheduled_id, col(ApiKey.project_id) == project_id)
            .with_for_update(of=ScheduledEvent)
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    if row.status != ScheduledEventStatus.PENDING:
        return row, False
    row.status = ScheduledEventStatus.CANCELLED
    row.updated_at = utc_now()
    return row, True
