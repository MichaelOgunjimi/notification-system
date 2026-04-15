"""Scheduled event endpoints — deferred event delivery."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import ApiKeyDep, SessionDep, api_key_filter_id
from app.models.enums import ScheduledEventStatus
from app.models.scheduled_event import ScheduledEvent
from app.schemas.common import PaginatedResponse
from app.schemas.scheduled_event import ScheduledEventCreate, ScheduledEventResponse
from app.services import scheduled_event_service

router = APIRouter(prefix="/scheduled-events", tags=["scheduled-events"])


def _to_response(event: ScheduledEvent) -> ScheduledEventResponse:
    payload = event.payload or {}
    return ScheduledEventResponse(
        id=event.id,
        api_key_id=event.api_key_id,
        event_type=str(payload.get("event_type") or ""),
        scheduled_for=event.scheduled_for,
        priority=event.priority,
        status=event.status,
        event_id=event.event_id,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


@router.post("", response_model=ScheduledEventResponse, status_code=status.HTTP_201_CREATED)
async def create_scheduled_event(
    body: ScheduledEventCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> ScheduledEventResponse:
    """Schedule an event for deferred delivery at a future timestamp."""
    event = await scheduled_event_service.create_scheduled_event(db, body, api_key.id)
    return _to_response(event)


@router.get("", response_model=PaginatedResponse[ScheduledEventResponse])
async def list_scheduled_events(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status_filter: ScheduledEventStatus | None = Query(default=None, alias="status"),
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> PaginatedResponse[ScheduledEventResponse]:
    api_key_filter = api_key_filter_id(api_key)
    events, total = await scheduled_event_service.list_scheduled_events(
        db, api_key_filter, status=status_filter, page=page, per_page=per_page
    )
    return PaginatedResponse.create([_to_response(e) for e in events], total, page, per_page)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_scheduled_event(
    event_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> None:
    """Cancel a pending scheduled event."""
    api_key_filter = api_key_filter_id(api_key)
    event = await scheduled_event_service.cancel_scheduled_event(db, event_id, api_key_filter)
    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled event not found",
        )
    if event.status != ScheduledEventStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel event with status '{event.status}'",
        )
