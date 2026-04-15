"""Template service — CRUD helpers plus template resolution/rendering."""

import uuid
from typing import Any

from jinja2 import BaseLoader
from jinja2.sandbox import SandboxedEnvironment
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlmodel import col

from app.models.enums import NotificationChannel
from app.models.template import Template
from app.schemas.templates import TemplateCreate, TemplateUpdate
from app.utils.datetime import utc_now

_jinja_env_html = SandboxedEnvironment(loader=BaseLoader(), autoescape=True)
_jinja_env_text = SandboxedEnvironment(loader=BaseLoader(), autoescape=False)


async def create_template(
    db: AsyncSession,
    data: TemplateCreate,
    api_key_id: uuid.UUID | None,
) -> Template:
    template = Template(
        api_key_id=api_key_id,
        name=data.name,
        channel=data.channel,
        subject=data.subject,
        body=data.body,
        variables=data.variables,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


async def list_templates(
    db: AsyncSession,
    *,
    page: int,
    per_page: int,
    api_key_id: uuid.UUID | None,
    channel: NotificationChannel | None = None,
) -> tuple[list[Template], int]:
    filters: list = [col(Template.is_active)]
    if api_key_id is not None:
        filters.append(
            or_(col(Template.api_key_id) == api_key_id, col(Template.api_key_id).is_(None))
        )
    if channel is not None:
        filters.append(col(Template.channel) == channel)

    count_result = await db.execute(select(func.count()).select_from(Template).where(*filters))
    total = int(count_result.scalar() or 0)

    offset = (page - 1) * per_page
    query = (
        select(Template)
        .where(*filters)
        .order_by(col(Template.api_key_id).is_(None), col(Template.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def get_template_for_key(
    db: AsyncSession,
    template_id: uuid.UUID,
    *,
    api_key_id: uuid.UUID | None,
) -> Template | None:
    filters = [col(Template.id) == template_id, col(Template.is_active)]
    if api_key_id is not None:
        filters.append(
            or_(col(Template.api_key_id) == api_key_id, col(Template.api_key_id).is_(None))
        )
    result = await db.execute(select(Template).where(*filters))
    return result.scalar_one_or_none()


async def get_owned_template(
    db: AsyncSession,
    template_id: uuid.UUID,
    *,
    api_key_id: uuid.UUID | None,
) -> Template | None:
    result = await db.execute(
        select(Template).where(
            col(Template.id) == template_id,
            col(Template.is_active),
            col(Template.api_key_id) == api_key_id,
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
    query = select(Template).where(col(Template.is_active))
    try:
        template_id = uuid.UUID(name_or_id)
    except ValueError:
        query = query.where(col(Template.name) == name_or_id)
    else:
        query = query.where(col(Template.id) == template_id)

    query = query.where(
        or_(col(Template.api_key_id) == api_key_id, col(Template.api_key_id).is_(None))
    ).order_by(col(Template.api_key_id).is_(None))
    return db.execute(query).scalar_one_or_none()


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
