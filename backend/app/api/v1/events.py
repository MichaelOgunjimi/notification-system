"""Event ingestion endpoints — POST /events, GET /events, GET /events/{id}."""

import logging
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from app.api.deps import ApiKeyDep, SessionDep, api_key_filter_id
from app.models.enums import EventStatus
from app.schemas.common import PaginatedResponse
from app.schemas.events import (
    EventBatchCreate,
    EventCreate,
    EventDetailResponse,
    EventResponse,
)
from app.schemas.notifications import NotificationResponse
from app.services import event_service
from app.utils.audit import log_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_event(
    body: EventCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
    response: Response,
) -> EventResponse:
    try:
        event, _notification_ids, is_duplicate = await event_service.create_event(
            db, body, api_key.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    if is_duplicate:
        response.status_code = status.HTTP_200_OK
    else:
        await log_action(
            db,
            api_key_id=api_key.id,
            action="event.created",
            resource_type="event",
            resource_id=str(event.id),
            metadata={"event_type": event.event_type, "priority": str(event.priority)},
            ip_address=request.client.host if request.client else None,
        )
        await db.commit()
    return EventResponse(
        id=event.id,
        event_type=event.event_type,
        priority=event.priority,
        status=event.status,
        recipient_count=event.recipient_count,
        has_failures=False,
        idempotency_key=event.idempotency_key,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


@router.post("/batch", response_model=list[EventResponse], status_code=status.HTTP_202_ACCEPTED)
async def create_batch_events(
    body: EventBatchCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
) -> list[EventResponse]:
    """Create multiple events atomically — all succeed or all roll back."""
    api_key_id = api_key.id
    try:
        event_results = await event_service.create_batch(db, body.events, api_key_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        )
    except Exception:
        logger.exception("Batch creation failed for api_key %s", api_key_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Batch creation failed",
        )
    for event, _notification_ids in event_results:
        await log_action(
            db,
            api_key_id=api_key_id,
            action="event.created",
            resource_type="event",
            resource_id=str(event.id),
            metadata={"event_type": event.event_type, "batch": True},
            ip_address=request.client.host if request.client else None,
        )
    await db.commit()
    return [
        EventResponse(
            id=event.id,
            event_type=event.event_type,
            priority=event.priority,
            status=event.status,
            recipient_count=event.recipient_count,
            has_failures=False,
            idempotency_key=event.idempotency_key,
            created_at=event.created_at,
            updated_at=event.updated_at,
        )
        for event, _notification_ids in event_results
    ]


@router.get("", response_model=PaginatedResponse[EventResponse])
async def list_events(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status: EventStatus | None = Query(default=None),
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> PaginatedResponse[EventResponse]:
    api_key_filter = api_key_filter_id(api_key)
    events, total = await event_service.list_events(
        db, api_key_filter, status=status, page=page, per_page=per_page
    )
    event_ids = [e.id for e in events]
    failed_ids = await event_service.bulk_has_failures(db, event_ids)
    items = [
        EventResponse(
            id=event.id,
            event_type=event.event_type,
            priority=event.priority,
            status=event.status,
            recipient_count=event.recipient_count,
            has_failures=event.id in failed_ids,
            idempotency_key=event.idempotency_key,
            created_at=event.created_at,
            updated_at=event.updated_at,
        )
        for event in events
    ]
    return PaginatedResponse.create(items, total, page, per_page)


@router.get("/{event_id}", response_model=EventDetailResponse)
async def get_event(
    event_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> EventDetailResponse:
    event = await event_service.get_event(db, event_id, api_key_id=api_key.id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    notifications = await event_service.get_event_notifications(db, event_id)
    has_failures = await event_service.event_has_failures(db, event.id)
    return EventDetailResponse(
        id=event.id,
        event_type=event.event_type,
        priority=event.priority,
        status=event.status,
        template_id=event.template_id,
        payload=event.payload,
        metadata=event.metadata_,
        idempotency_key=event.idempotency_key,
        batch_id=event.batch_id,
        recipient_count=event.recipient_count,
        has_failures=has_failures,
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        created_at=event.created_at,
        updated_at=event.updated_at,
    )
