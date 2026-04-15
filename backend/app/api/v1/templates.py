"""Template endpoints — own templates + system defaults."""

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.api.deps import ApiKeyDep, SessionDep
from app.models.enums import NotificationChannel
from app.schemas.common import PaginatedResponse
from app.schemas.templates import (
    TemplateCreate,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    TemplateResponse,
    TemplateUpdate,
)
from app.services import template_service
from app.utils.audit import log_action

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=PaginatedResponse[TemplateResponse])
async def list_templates(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    channel: NotificationChannel | None = Query(default=None),
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> PaginatedResponse[TemplateResponse]:
    items, total = await template_service.list_templates(
        db,
        page=page,
        per_page=per_page,
        api_key_id=api_key.id,
        channel=channel,
    )
    return PaginatedResponse.create(
        [TemplateResponse.model_validate(item) for item in items],
        total,
        page,
        per_page,
    )


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
) -> TemplateResponse:
    template = await template_service.create_template(db, body, api_key.id)
    await log_action(
        db,
        api_key_id=api_key.id,
        action="template.created",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"name": template.name, "channel": str(template.channel)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(template)


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> TemplateResponse:
    template = await template_service.get_template_for_key(db, template_id, api_key_id=api_key.id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return TemplateResponse.model_validate(template)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
) -> TemplateResponse:
    template = await template_service.get_owned_template(db, template_id, api_key_id=api_key.id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not owned by API key",
        )

    updated = await template_service.update_template(db, template, body)
    await log_action(
        db,
        api_key_id=api_key.id,
        action="template.updated",
        resource_type="template",
        resource_id=str(updated.id),
        metadata={"name": updated.name, "channel": str(updated.channel)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(updated)


@router.post("/{template_id}/preview", response_model=TemplatePreviewResponse)
async def preview_template(
    template_id: uuid.UUID,
    body: TemplatePreviewRequest,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> TemplatePreviewResponse:
    template = await template_service.get_template_for_key(db, template_id, api_key_id=api_key.id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    rendered_subject, rendered_body = template_service.preview_template(
        template.body,
        template.subject,
        channel=template.channel,
        variables=body.variables,
    )
    return TemplatePreviewResponse(subject=rendered_subject, body=rendered_body)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
) -> None:
    template = await template_service.get_owned_template(db, template_id, api_key_id=api_key.id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not owned by API key",
        )
    await template_service.soft_delete_template(db, template)
    await log_action(
        db,
        api_key_id=api_key.id,
        action="template.deleted",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"name": template.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
