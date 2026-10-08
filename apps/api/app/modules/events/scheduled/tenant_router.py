"""Session-auth scheduled event endpoints — the dashboard's per-project view.

Unlike ``router.py`` (API-key authenticated, used by SDKs), these routes are
scoped to a project and its members. A scheduled event is owned by an API key and a
signed-in user holds none (secrets are stored hashed), so creating one names a project
key; the route then applies the same checks and the same creation service as the public
endpoint, with the key's identity resolved server-side instead of from ``X-API-Key``.
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse

from app.core.http.dependencies import SessionDep
from app.core.http.rate_limit import consume_rate_limit
from app.core.http.schemas import PaginatedResponse
from app.core.pagination import Page
from app.modules.credentials.authentication import (
    api_key_has_scope,
    api_key_is_usable,
    get_project_api_key,
    mark_api_key_used,
)
from app.modules.credentials.types import ApiKeyScope
from app.modules.events.enums import ScheduledEventStatus
from app.modules.events.scheduled import service as scheduled_event_service
from app.modules.events.scheduled import tenant_service
from app.modules.events.scheduled.display import ScheduledDisplayStatus
from app.modules.events.scheduled.schemas import (
    ScheduledEventCreate,
    TenantScheduledEventCreate,
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
    status_: ScheduledDisplayStatus | None = Query(default=None, alias="status"),
) -> Page[TenantScheduledEventResponse]:
    """List scheduled events, filtered by the status shown in the dashboard.

    Latest scheduled time first; ``status=pending`` reads soonest first, as a queue.
    """
    await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.READ_PROJECT_DELIVERIES,
    )
    return await tenant_service.list_project_scheduled_events(
        db, project_id=project_id, status=status_, page=page, per_page=per_page
    )


@router.post(
    "/projects/{project_id}/scheduled-events",
    response_model=TenantScheduledEventDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_scheduled_event(
    project_id: uuid.UUID,
    body: TenantScheduledEventCreate,
    user: CurrentUserDep,
    db: SessionDep,
    request: Request,
) -> TenantScheduledEventDetailResponse | JSONResponse:
    """Schedule an event, owned by the chosen project API key.

    The key must belong to the project, be active and unrevoked, and hold
    ``scheduled_events:write``; it is rate limited in the key's own bucket and the request
    is attributed to it in usage. Content validation and storage are the public endpoint's.
    """
    access = await authorize_project(
        db,
        user_id=user.id,
        project_id=project_id,
        capability=OrganizationCapability.MANAGE_PROJECT_DELIVERIES,
    )
    api_key = await get_project_api_key(db, project_id=project_id, api_key_id=body.api_key_id)
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="API key not found in this project",
        )
    if not api_key_is_usable(api_key):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"API key '{api_key.name}' is revoked or inactive",
        )
    if not api_key_has_scope(api_key, ApiKeyScope.SCHEDULED_EVENTS_WRITE):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"API key '{api_key.name}' requires scope: {ApiKeyScope.SCHEDULED_EVENTS_WRITE}",
        )
    rate_limit = await consume_rate_limit(api_key.key_hash, "general")
    if not rate_limit.allowed:
        return rate_limit.exceeded_response()

    request.state.api_key_id = api_key.id  # usage tracking attributes the request to the key
    await mark_api_key_used(db, api_key.id)
    try:
        created = await scheduled_event_service.create_scheduled_event(
            db, ScheduledEventCreate(**body.model_dump(exclude={"api_key_id"})), api_key.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))
    await log_action(
        db,
        api_key_id=api_key.id,
        organization_id=access.project.organization_id,
        project_id=access.project.id,
        actor_user_id=user.id,
        action="scheduled_event.created",
        resource_type="scheduled_event",
        resource_id=str(created.id),
        metadata={
            "via": "dashboard",
            "api_key_name": api_key.name,
            "api_key_prefix": api_key.key_prefix,
            "event_type": body.event_type,
            "scheduled_for": created.scheduled_for.isoformat(),
        },
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    detail = await tenant_service.get_project_scheduled_event(
        db, project_id=project_id, scheduled_id=created.id
    )
    assert detail is not None
    response = JSONResponse(
        status_code=status.HTTP_201_CREATED, content=detail.model_dump(mode="json")
    )
    response.headers.update(rate_limit.headers())
    return response


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
