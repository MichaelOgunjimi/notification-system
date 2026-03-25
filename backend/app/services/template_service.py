"""Template service — CRUD operations, Jinja2 rendering, and version management."""

import uuid

from jinja2 import BaseLoader, Environment
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.template import Template
from app.schemas.templates import TemplateCreate, TemplateUpdate

_jinja_env = Environment(loader=BaseLoader(), autoescape=True)


async def create_template(db: AsyncSession, data: TemplateCreate) -> Template:
    template = Template(
        name=data.name,
        channel=data.channel,
        subject=data.subject,
        body=data.body,
        variables=data.variables if data.variables is not None else [],
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def get_template(db: AsyncSession, template_id: uuid.UUID) -> Template | None:
    result = await db.execute(
        select(Template).where(Template.id == template_id, Template.is_active == True)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def list_templates(
    db: AsyncSession, page: int, per_page: int
) -> tuple[list[Template], int]:
    count_result = await db.execute(
        select(func.count()).select_from(Template).where(Template.is_active == True)  # noqa: E712
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Template)
        .where(Template.is_active == True)  # noqa: E712
        .order_by(Template.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    items = list(result.scalars().all())
    return items, total


async def update_template(
    db: AsyncSession, template_id: uuid.UUID, data: TemplateUpdate
) -> Template | None:
    template = await get_template(db, template_id)
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


async def delete_template(db: AsyncSession, template_id: uuid.UUID) -> bool:
    template = await get_template(db, template_id)
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
