"""Template endpoints — own templates + system defaults."""

import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.http.dependencies import SessionDep
from app.core.http.schemas import PaginatedResponse
from app.modules.credentials.dependencies import (
    TemplatesReadApiKeyDep,
    TemplatesWriteApiKeyDep,
    api_key_filter_id,
)
from app.modules.notifications.enums import NotificationChannel
from app.modules.observability.audit.service import log_action
from app.modules.templates import service as template_service
from app.modules.templates.schemas import (
    TemplateCreate,
    TemplateImportRequest,
    TemplateImportResponse,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    TemplateResponse,
    TemplateUpdate,
    TemplateUpsert,
)

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=PaginatedResponse[TemplateResponse])
async def list_templates(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    channel: NotificationChannel | None = Query(default=None),
    *,
    db: SessionDep,
    api_key: TemplatesReadApiKeyDep,
) -> PaginatedResponse[TemplateResponse]:
    items, total = await template_service.list_templates(
        db,
        page=page,
        per_page=per_page,
        project_id=api_key.project_id,
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
    api_key: TemplatesWriteApiKeyDep,
    request: Request,
) -> TemplateResponse:
    template = await template_service.create_template(
        db, body, project_id=api_key.project_id, api_key_id=api_key.id
    )
    await log_action(
        db,
        api_key_id=api_key_filter_id(api_key),
        action="template.created",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"name": template.name, "channel": str(template.channel)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(template)


@router.put("/by-name/{name}", response_model=TemplateResponse)
async def upsert_template_by_name(
    name: str,
    body: TemplateUpsert,
    channel: NotificationChannel = Query(default=NotificationChannel.EMAIL),
    *,
    db: SessionDep,
    api_key: TemplatesWriteApiKeyDep,
    request: Request,
) -> TemplateResponse:
    template = await template_service.upsert_template_by_name(
        db,
        body,
        name=name,
        channel=channel,
        project_id=api_key.project_id,
        api_key_id=api_key.id,
    )
    await log_action(
        db,
        api_key_id=api_key_filter_id(api_key),
        action="template.synced",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"name": template.name, "channel": str(template.channel)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateResponse.model_validate(template)


@router.post("/import", response_model=TemplateImportResponse, status_code=status.HTTP_201_CREATED)
async def import_template(
    body: TemplateImportRequest,
    *,
    db: SessionDep,
    api_key: TemplatesWriteApiKeyDep,
    request: Request,
) -> TemplateImportResponse:
    imported_html = template_service.import_html_variables(body.html, body.variables)
    template = await template_service.create_template(
        db,
        TemplateCreate(
            name=body.name,
            channel=NotificationChannel.EMAIL,
            subject=body.subject,
            body=imported_html,
        ),
        project_id=api_key.project_id,
        api_key_id=api_key.id,
    )
    subject, html, text, used, missing = template_service.preview_template_parts(
        template.body,
        template.subject,
        template.text_body,
        template.channel,
        body.variables,
    )
    await log_action(
        db,
        api_key_id=api_key_filter_id(api_key),
        action="template.imported",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"name": template.name, "channel": str(template.channel)},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return TemplateImportResponse(
        template=TemplateResponse.model_validate(template),
        preview=TemplatePreviewResponse(
            subject=subject,
            html=html,
            text=text,
            body=html,
            variables_used=used,
            missing_variables=missing,
        ),
    )


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: TemplatesReadApiKeyDep,
) -> TemplateResponse:
    template = await template_service.get_template_for_project(
        db, template_id, project_id=api_key.project_id
    )
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return TemplateResponse.model_validate(template)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    *,
    db: SessionDep,
    api_key: TemplatesWriteApiKeyDep,
    request: Request,
) -> TemplateResponse:
    template = await template_service.get_owned_template(
        db, template_id, project_id=api_key.project_id
    )
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not owned by API key",
        )

    updated = await template_service.update_template(db, template, body)
    await log_action(
        db,
        api_key_id=api_key_filter_id(api_key),
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
    api_key: TemplatesReadApiKeyDep,
) -> TemplatePreviewResponse:
    template = await template_service.get_template_for_project(
        db, template_id, project_id=api_key.project_id
    )
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    rendered_subject, rendered_body, rendered_text, used, missing = (
        template_service.preview_template_parts(
            template.body,
            template.subject,
            template.text_body,
            channel=template.channel,
            variables=body.variables,
        )
    )
    return TemplatePreviewResponse(
        subject=rendered_subject,
        html=rendered_body,
        text=rendered_text,
        body=rendered_body,
        variables_used=used,
        missing_variables=missing,
    )


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: TemplatesWriteApiKeyDep,
    request: Request,
) -> None:
    template = await template_service.get_owned_template(
        db, template_id, project_id=api_key.project_id
    )
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not owned by API key",
        )
    await template_service.soft_delete_template(db, template)
    await log_action(
        db,
        api_key_id=api_key_filter_id(api_key),
        action="template.deleted",
        resource_type="template",
        resource_id=str(template.id),
        metadata={"name": template.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
