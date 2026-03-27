"""Event ingestion endpoints — POST /events, GET /events, GET /events/{id}."""

import uuid

from fastapi import APIRouter, HTTPException, status

from app.api.deps import ApiKeyDep, SessionDep
from app.schemas.events import (
    EventBatchCreate,
    EventCreate,
    EventDetailResponse,
    EventResponse,
)
from app.services import event_service

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    body: EventCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> EventResponse:
    event, notification_ids = await event_service.create_event(db, body, api_key.id)
    return EventResponse(
        id=event.id,
        event_type=event.event_type,
        priority=event.priority,
        status=event.status,
        notification_ids=notification_ids,
        created_at=event.created_at,
    )


@router.post("/batch", response_model=list[EventResponse], status_code=status.HTTP_201_CREATED)
async def create_batch_events(
    body: EventBatchCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> list[EventResponse]:
    results: list[EventResponse] = []
    for event_data in body.events:
        event, notification_ids = await event_service.create_event(db, event_data, api_key.id)
        results.append(
            EventResponse(
                id=event.id,
                event_type=event.event_type,
                priority=event.priority,
                status=event.status,
                notification_ids=notification_ids,
                created_at=event.created_at,
            )
        )
    return results


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

    notification_ids = await event_service.get_event_notification_ids(db, event_id)
    return EventDetailResponse(
        id=event.id,
        event_type=event.event_type,
        priority=event.priority,
        status=event.status,
        template_id=event.template_id,
        payload=event.payload,
        metadata=event.metadata_,
        api_key_id=event.api_key_id,
        idempotency_key=event.idempotency_key,
        batch_id=event.batch_id,
        recipient_count=event.recipient_count,
        notification_ids=notification_ids,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )
