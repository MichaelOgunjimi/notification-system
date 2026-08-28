"""Dead letter queue endpoints — review and retry failed messages.

Endpoints:
  GET    /dead-letter           — List DLQ messages (paginated, filterable)
  GET    /dead-letter/{id}      — Get DLQ message detail with retry history
  POST   /dead-letter/{id}/retry   — Re-enqueue for delivery
  POST   /dead-letter/{id}/discard — Mark as acknowledged (won't retry)
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, status

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.modules.credentials.dependencies import (
    DeadLettersReadApiKeyDep,
    DeadLettersWriteApiKeyDep,
    api_key_filter_id,
)
from app.modules.delivery.dead_letter import service as dead_letter_service
from app.modules.delivery.dead_letter.schemas import DeadLetterDetailResponse, DeadLetterResponse
from app.modules.delivery.enums import DeadLetterStatus
from app.modules.notifications.enums import NotificationChannel

router = APIRouter(prefix="/dead-letter", tags=["dead-letter"])


@router.get("", response_model=PaginatedResponse[DeadLetterResponse])
async def list_dead_letters(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    status_filter: DeadLetterStatus | None = Query(default=None, alias="status"),
    channel: NotificationChannel | None = Query(default=None),
    *,
    db: SessionDep,
    api_key: DeadLettersReadApiKeyDep,
) -> PaginatedResponse[DeadLetterResponse]:
    """List dead letter queue messages, scoped to the authenticated API key."""
    items, total = await dead_letter_service.list_dead_letters(
        db,
        api_key_id=api_key_filter_id(api_key),
        page=page,
        per_page=per_page,
        status=status_filter,
        channel=channel,
    )
    response_items = [DeadLetterResponse.model_validate(dlq) for dlq in items]
    return PaginatedResponse.create(response_items, total, page, per_page)


@router.get("/{dlq_id}", response_model=DeadLetterDetailResponse)
async def get_dead_letter(
    dlq_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: DeadLettersReadApiKeyDep,
) -> DeadLetterDetailResponse:
    """Get full detail of a DLQ message including retry history."""
    dlq = await dead_letter_service.get_dead_letter(
        db, dlq_id, api_key_id=api_key_filter_id(api_key)
    )
    if dlq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dead letter message not found",
        )
    return DeadLetterDetailResponse.model_validate(dlq)


@router.post("/{dlq_id}/retry", response_model=DeadLetterDetailResponse)
async def retry_dead_letter(
    dlq_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: DeadLettersWriteApiKeyDep,
) -> DeadLetterDetailResponse:
    """Re-enqueue a dead letter message for delivery.

    Resets the notification to QUEUED with retry_count=0 and enqueues to
    the appropriate channel worker. Only ACTIVE messages can be retried.
    """
    dlq = await dead_letter_service.retry_dead_letter(
        db, dlq_id, api_key_id=api_key_filter_id(api_key)
    )
    if dlq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dead letter message not found or not in ACTIVE status",
        )
    return DeadLetterDetailResponse.model_validate(dlq)


@router.post("/{dlq_id}/discard", response_model=DeadLetterDetailResponse)
async def discard_dead_letter(
    dlq_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: DeadLettersWriteApiKeyDep,
) -> DeadLetterDetailResponse:
    """Mark a dead letter message as discarded (acknowledged, won't retry).

    Only ACTIVE messages can be discarded.
    """
    dlq = await dead_letter_service.discard_dead_letter(
        db, dlq_id, api_key_id=api_key_filter_id(api_key)
    )
    if dlq is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dead letter message not found or not in ACTIVE status",
        )
    return DeadLetterDetailResponse.model_validate(dlq)
