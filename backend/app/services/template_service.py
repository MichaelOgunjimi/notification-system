"""Template service — CRUD operations, Jinja2 rendering, and version management."""

import uuid

from jinja2 import BaseLoader, Environment
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.models.template import Template
from app.schemas.templates import TemplateCreate, TemplateUpdate

_jinja_env = Environment(loader=BaseLoader(), autoescape=True)


async def create_template(
    db: AsyncSession, data: TemplateCreate, api_key_id: uuid.UUID | None = None
) -> Template:
    template = Template(
        name=data.name,
        channel=data.channel,
        subject=data.subject,
        body=data.body,
        variables=data.variables if data.variables is not None else [],
        created_by=api_key_id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def get_template(
    db: AsyncSession, template_id: uuid.UUID, api_key_id: uuid.UUID | None = None
) -> Template | None:
    query = select(Template).where(col(Template.id) == template_id, col(Template.is_active))
    if api_key_id is not None:
        query = query.where(col(Template.created_by) == api_key_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_templates(
    db: AsyncSession, page: int, per_page: int, api_key_id: uuid.UUID | None = None
) -> tuple[list[Template], int]:
    base_filter = col(Template.is_active)
    count_query = select(func.count()).select_from(Template).where(base_filter)
    if api_key_id is not None:
        count_query = count_query.where(col(Template.created_by) == api_key_id)
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    offset = (page - 1) * per_page
    query = (
        select(Template)
        .where(base_filter)
        .order_by(col(Template.created_at).desc())
        .offset(offset)
        .limit(per_page)
    )
    if api_key_id is not None:
        query = query.where(col(Template.created_by) == api_key_id)
    result = await db.execute(query)
    items = list(result.scalars().all())
    return items, total


async def update_template(
    db: AsyncSession,
    template_id: uuid.UUID,
    data: TemplateUpdate,
    api_key_id: uuid.UUID | None = None,
) -> Template | None:
    template = await get_template(db, template_id, api_key_id=api_key_id)
    if template is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)

    from app.utils.datetime import utc_now

    template.updated_at = utc_now()
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def delete_template(
    db: AsyncSession, template_id: uuid.UUID, api_key_id: uuid.UUID | None = None
) -> bool:
    template = await get_template(db, template_id, api_key_id=api_key_id)
    if template is None:
        return False

    from app.utils.datetime import utc_now

    template.is_active = False
    template.updated_at = utc_now()
    db.add(template)
    await db.commit()
    return True


def preview_template(
    body: str,
    subject: str | None,
    variables: dict,
) -> tuple[str | None, str]:
    rendered_body = _jinja_env.from_string(body).render(**variables)
    rendered_subject = None
    if subject:
        rendered_subject = _jinja_env.from_string(subject).render(**variables)
    return rendered_subject, rendered_body
