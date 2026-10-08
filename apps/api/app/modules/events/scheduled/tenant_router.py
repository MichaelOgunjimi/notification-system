"""Session-auth scheduled event endpoints — the dashboard's per-project view.

Unlike ``router.py`` (API-key authenticated, used by SDKs), these routes are
scoped to a project and its members. They cannot create events: a scheduled
event is owned by an API key, and a signed-in user has none.
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.core.pagination import Page
from app.modules.events.enums import ScheduledEventStatus
from app.modules.events.scheduled import tenant_service
from app.modules.events.scheduled.schemas import (
    TenantScheduledEventDetailResponse,
    TenantScheduledEventResponse,
)
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.observability.audit.service import log_action
from app.modules.tenancy.authorization import OrganizationCapability, authorize_project
from app.modules.tenancy.errors import TenantResourceNotFoundError

router = APIRouter(tags=["tenant-scheduled-events"])


@router.get(
    "/projects/{project_id}/scheduled-events",
    response_model=PaginatedResponse[TenantScheduledEventResponse],
)
async def list_project_scheduled_events(
    project_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    status_: ScheduledEventStatus | None = Query(default=None, alias="status"),
) -> Page[TenantScheduledEventResponse]:
    await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_DELIVERIES,
    )
    return await tenant_service.list_project_scheduled_events(
        db, project_id=project_id, status=status_, page=page, per_page=per_page
    )


@router.get(
    "/projects/{project_id}/scheduled-events/{scheduled_event_id}",
    response_model=TenantScheduledEventDetailResponse,
)
async def get_project_scheduled_event(
    project_id: uuid.UUID,
    scheduled_event_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> TenantScheduledEventDetailResponse:
    await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_DELIVERIES,
    )
    detail = await tenant_service.get_project_scheduled_event(
        db, project_id=project_id, scheduled_id=scheduled_event_id
    )
    if detail is None:
        raise TenantResourceNotFoundError("Scheduled event")
    return detail


@router.delete(
    "/projects/{project_id}/scheduled-events/{scheduled_event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_project_scheduled_event(
    project_id: uuid.UUID,
    scheduled_event_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> None:
    """Cancel a pending scheduled event; 409 once it is no longer pending."""
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_DELIVERIES,
    )
    outcome = await tenant_service.cancel_project_scheduled_event(
        db, project_id=project_id, scheduled_id=scheduled_event_id
    )
    if outcome is None:
        raise TenantResourceNotFoundError("Scheduled event")
    row, changed = outcome
    if changed:
        await log_action(
            db,
            api_key_id=None,
            organization_id=access.project.organization_id,
            project_id=access.project.id,
            actor_user_id=user.id,
            action="scheduled_event.cancelled",
            resource_type="scheduled_event",
            resource_id=str(row.id),
            ip_address=request.client.host if request.client else None,
        )
        await db.commit()
        return
    final_status = row.status
    await db.rollback()  # nothing changed; release the row lock
    if final_status != ScheduledEventStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel a scheduled event that is {final_status}",
        )
