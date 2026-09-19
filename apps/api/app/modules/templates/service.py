"""Template service — CRUD helpers plus template resolution/rendering."""

import uuid
from typing import Any

from fastapi import HTTPException, status
from jinja2 import BaseLoader
from jinja2.sandbox import SandboxedEnvironment
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlmodel import col

from app.core.datetime import utc_now
from app.core.pagination import Page
from app.modules.credentials.model import ApiKey
from app.modules.notifications.enums import NotificationChannel
from app.modules.templates.model import Template
from app.modules.templates.schemas import TemplateCreate, TemplateUpdate
from app.modules.tenancy.errors import TenantResourceNotFoundError
from app.modules.tenancy.models.project import Project

_jinja_env_html = SandboxedEnvironment(loader=BaseLoader(), autoescape=True)
_jinja_env_text = SandboxedEnvironment(loader=BaseLoader(), autoescape=False)

_DUPLICATE_NAME_DETAIL = "A template with this name and channel already exists in this project"


async def _insert_template(db: AsyncSession, template: Template) -> Template:
    db.add(template)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_NAME_DETAIL
        ) from exc
    await db.refresh(template)
    return template


async def create_template(
    db: AsyncSession,
    data: TemplateCreate,
    *,
    project_id: uuid.UUID | None,
    api_key_id: uuid.UUID | None = None,
) -> Template:
    template = Template(
        project_id=project_id,
        api_key_id=api_key_id,
        name=data.name,
        channel=data.channel,
        subject=data.subject,
        body=data.body,
        variables=data.variables,
    )
    return await _insert_template(db, template)


async def _template_page(
    db: AsyncSession, *, filters: list[Any], page: int, per_page: int
) -> Page[Template]:
    total = int(
        (await db.execute(select(func.count()).select_from(Template).where(*filters))).scalar() or 0
    )
    result = await db.execute(
        select(Template)
        .where(*filters)
        .order_by(col(Template.created_at).desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return Page(items=list(result.scalars().all()), total=total, page=page, per_page=per_page)


async def list_templates(
    db: AsyncSession,
    *,
    page: int,
    per_page: int,
    project_id: uuid.UUID | None,
    channel: NotificationChannel | None = None,
) -> tuple[list[Template], int]:
    """List templates usable by a project: its own, plus system defaults."""
    filters: list = [col(Template.is_active)]
    if project_id is not None:
        filters.append(
            or_(col(Template.project_id) == project_id, col(Template.project_id).is_(None))
        )
    if channel is not None:
        filters.append(col(Template.channel) == channel)

    count_result = await db.execute(select(func.count()).select_from(Template).where(*filters))
    total = int(count_result.scalar() or 0)

    offset = (page - 1) * per_page
    query = (
        select(Template)
        .where(*filters)
        .order_by(col(Template.project_id).is_(None), col(Template.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def list_templates_for_project(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    page: int,
    per_page: int,
    channel: NotificationChannel | None = None,
) -> Page[Template]:
    """Strictly this project's own templates — never a system default."""
    filters: list = [col(Template.is_active), col(Template.project_id) == project_id]
    if channel is not None:
        filters.append(col(Template.channel) == channel)
    return await _template_page(db, filters=filters, page=page, per_page=per_page)


async def list_system_default_templates(
    db: AsyncSession,
    *,
    page: int,
    per_page: int,
    channel: NotificationChannel | None = None,
) -> Page[Template]:
    filters: list = [col(Template.is_active), col(Template.project_id).is_(None)]
    if channel is not None:
        filters.append(col(Template.channel) == channel)
    return await _template_page(db, filters=filters, page=page, per_page=per_page)


async def list_templates_for_organization(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    page: int,
    per_page: int,
    channel: NotificationChannel | None = None,
    project_id: uuid.UUID | None = None,
) -> Page[Template]:
    """Every template owned by any project in this organization."""
    org_project_ids = select(col(Project.id)).where(col(Project.organization_id) == organization_id)
    filters: list = [col(Template.is_active), col(Template.project_id).in_(org_project_ids)]
    if project_id is not None:
        filters.append(col(Template.project_id) == project_id)
    if channel is not None:
        filters.append(col(Template.channel) == channel)
    return await _template_page(db, filters=filters, page=page, per_page=per_page)


async def fork_template(
    db: AsyncSession, *, template_id: uuid.UUID, project_id: uuid.UUID
) -> Template:
    """Copy a system default into a new template owned by this project.

    The original default is never modified — forking only ever creates a
    new, independently-editable row.
    """
    source = (
        await db.execute(
            select(Template).where(
                col(Template.id) == template_id,
                col(Template.is_active),
                col(Template.project_id).is_(None),
            )
        )
    ).scalar_one_or_none()
    if source is None:
        raise TenantResourceNotFoundError("System default template")

    fork = Template(
        project_id=project_id,
        name=source.name,
        channel=source.channel,
        subject=source.subject,
        body=source.body,
        variables=list(source.variables),
    )
    return await _insert_template(db, fork)


async def get_template_for_project(
    db: AsyncSession,
    template_id: uuid.UUID,
    *,
    project_id: uuid.UUID | None,
) -> Template | None:
    """Return a template usable by this project: its own, or a system default."""
    filters = [col(Template.id) == template_id, col(Template.is_active)]
    if project_id is not None:
        filters.append(
            or_(col(Template.project_id) == project_id, col(Template.project_id).is_(None))
        )
    result = await db.execute(select(Template).where(*filters))
    return result.scalar_one_or_none()


async def get_owned_template(
    db: AsyncSession,
    template_id: uuid.UUID,
    *,
    project_id: uuid.UUID | None,
) -> Template | None:
    """Return the template only if this project owns it (strict equality —
    never a system default, and never another project's template)."""
    result = await db.execute(
        select(Template).where(
            col(Template.id) == template_id,
            col(Template.is_active),
            col(Template.project_id) == project_id,
        )
    )
    return result.scalar_one_or_none()


async def update_template(db: AsyncSession, template: Template, data: TemplateUpdate) -> Template:
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)
    template.updated_at = utc_now()
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


async def soft_delete_template(db: AsyncSession, template: Template) -> None:
    template.is_active = False
    template.updated_at = utc_now()
    db.add(template)
    await db.flush()


def resolve_template(
    db: Session,
    name_or_id: str,
    api_key_id: uuid.UUID,
) -> Template | None:
    """Resolve a template by id or name for the project that owns this key.

    A project's own template and a system default can legitimately share a
    name, so this can match more than one row — .first() with the
    project-owned-first ordering picks deterministically instead of raising.
    """
    project_id = db.execute(
        select(col(ApiKey.project_id)).where(col(ApiKey.id) == api_key_id)
    ).scalar_one_or_none()

    query = select(Template).where(col(Template.is_active))
    try:
        template_id = uuid.UUID(name_or_id)
    except ValueError:
        query = query.where(col(Template.name) == name_or_id)
    else:
        query = query.where(col(Template.id) == template_id)

    query = query.where(
        or_(col(Template.project_id) == project_id, col(Template.project_id).is_(None))
    ).order_by(col(Template.project_id).is_(None), col(Template.created_at).desc())
    return db.execute(query).scalars().first()


def render_template(template: Template, payload_vars: dict[str, Any]) -> tuple[str | None, str]:
    env = _jinja_env_html if template.channel == NotificationChannel.EMAIL else _jinja_env_text
    rendered_subject = (
        env.from_string(template.subject).render(**payload_vars) if template.subject else None
    )
    rendered_body = env.from_string(template.body).render(**payload_vars)
    return rendered_subject, rendered_body


def preview_template(
    body: str,
    subject: str | None,
    channel: NotificationChannel,
    variables: dict[str, Any],
) -> tuple[str | None, str]:
    env = _jinja_env_html if channel == NotificationChannel.EMAIL else _jinja_env_text
    rendered_subject = env.from_string(subject).render(**variables) if subject else None
    rendered_body = env.from_string(body).render(**variables)
    return rendered_subject, rendered_body
