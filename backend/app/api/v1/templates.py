"""Template CRUD endpoints — POST/GET/PATCH/DELETE /templates."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_api_key, get_db
from app.models.api_key import ApiKey
from app.schemas.common import PaginatedResponse
from app.schemas.templates import (
    TemplateCreate,
    TemplatePreview,
    TemplatePreviewResponse,
    TemplateResponse,
    TemplateUpdate,
)
from app.services import template_service

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_current_api_key),
) -> TemplateResponse:
    template = await template_service.create_template(db, body)
    return TemplateResponse.model_validate(template)


@router.get("", response_model=PaginatedResponse[TemplateResponse])
async def list_templates(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_current_api_key),
) -> PaginatedResponse[TemplateResponse]:
    items, total = await template_service.list_templates(db, page, per_page)
    response_items = [TemplateResponse.model_validate(t) for t in items]
    return PaginatedResponse.create(response_items, total, page, per_page)


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_current_api_key),
) -> TemplateResponse:
    template = await template_service.get_template(db, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    return TemplateResponse.model_validate(template)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_current_api_key),
) -> TemplateResponse:
    template = await template_service.update_template(db, template_id, body)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    return TemplateResponse.model_validate(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_current_api_key),
) -> None:
    deleted = await template_service.delete_template(db, template_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )


@router.post("/{template_id}/preview", response_model=TemplatePreviewResponse)
async def preview_template(
    template_id: uuid.UUID,
    body: TemplatePreview,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_current_api_key),
) -> TemplatePreviewResponse:
    template = await template_service.get_template(db, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    rendered_subject, rendered_body = template_service.preview_template(
        template.body, template.subject, body.variables
    )
    return TemplatePreviewResponse(subject=rendered_subject, body=rendered_body)
