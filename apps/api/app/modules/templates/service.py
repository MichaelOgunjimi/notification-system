"""Template service — CRUD helpers plus template resolution/rendering."""

import re
import uuid
from html.parser import HTMLParser
from typing import Any

from fastapi import HTTPException, status
from jinja2 import BaseLoader, StrictUndefined, meta
from jinja2.exceptions import TemplateError
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
from app.modules.templates.schemas import TemplateCreate, TemplateUpdate, TemplateUpsert
from app.modules.tenancy.errors import TenantResourceNotFoundError
from app.modules.tenancy.models.project import Project

_jinja_env_html = SandboxedEnvironment(loader=BaseLoader(), autoescape=True)
_jinja_env_text = SandboxedEnvironment(loader=BaseLoader(), autoescape=False)
_jinja_env_html_strict = SandboxedEnvironment(
    loader=BaseLoader(), autoescape=True, undefined=StrictUndefined
)
_jinja_env_text_strict = SandboxedEnvironment(
    loader=BaseLoader(), autoescape=False, undefined=StrictUndefined
)

_DUPLICATE_NAME_DETAIL = "A template with this name and channel already exists in this project"


class _TextExtractor(HTMLParser):
    _HIDDEN_TAGS = frozenset({"head", "script", "style"})
    _BLOCK_TAGS = frozenset(
        {
            "address",
            "article",
            "br",
            "div",
            "footer",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "li",
            "p",
            "section",
            "tr",
        }
    )

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.hidden_depth = 0

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth:
            self.parts.append(data)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        if tag in self._HIDDEN_TAGS:
            self.hidden_depth += 1
        elif not self.hidden_depth and tag in self._BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._HIDDEN_TAGS:
            self.hidden_depth = max(0, self.hidden_depth - 1)
        elif not self.hidden_depth and tag in self._BLOCK_TAGS:
            self.parts.append("\n")


class _ImportInspector(HTMLParser):
    def __init__(self, samples: set[str]) -> None:
        super().__init__(convert_charrefs=False)
        self.samples = samples
        self.text_counts = dict.fromkeys(samples, 0)
        self.attribute_samples: set[str] = set()

    def handle_data(self, data: str) -> None:
        for sample in self.samples:
            self.text_counts[sample] += data.count(sample)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del tag
        for _name, value in attrs:
            if value is None:
                continue
            self.attribute_samples.update(sample for sample in self.samples if sample in value)


def html_to_text(html: str) -> str:
    """Derive readable plain text from an HTML email without another dependency."""
    parser = _TextExtractor()
    parser.feed(html)
    return "\n".join(line.strip() for line in "".join(parser.parts).splitlines() if line.strip())


def detect_variables(
    body: str, subject: str | None = None, text_body: str | None = None
) -> list[str]:
    """Return sorted undeclared Jinja variables across all template parts."""
    detected: set[str] = set()
    for source in (subject, body, text_body):
        if source:
            detected.update(meta.find_undeclared_variables(_jinja_env_text.parse(source)))
    return sorted(detected)


def _validated_variables(
    body: str,
    subject: str | None,
    text_body: str | None,
    declared: list[str] | None,
) -> list[str]:
    try:
        detected = detect_variables(body, subject, text_body)
    except TemplateError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Invalid template syntax: {exc}",
        ) from exc
    if declared is not None and set(declared) != set(detected):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "variables must exactly match variables used by the template; "
                f"declared={sorted(set(declared))}, detected={detected}"
            ),
        )
    return detected


def import_html_variables(html: str, variables: dict[str, str]) -> str:
    """Replace unambiguous sample values found once in HTML text nodes."""
    if any(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) is None for name in variables):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Import variable names must be valid identifiers",
        )
    if any(not value for value in variables.values()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Import sample values cannot be empty",
        )
    if len(set(variables.values())) != len(variables):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Each import variable must have a unique sample value",
        )
    samples = set(variables.values())
    if any(left != right and left in right for left in samples for right in samples):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Import sample values cannot overlap",
        )

    inspector = _ImportInspector(samples)
    inspector.feed(html)
    for name, sample in variables.items():
        if sample in inspector.attribute_samples:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Sample value for '{name}' appears in an HTML attribute; "
                    "replacement is ambiguous"
                ),
            )
        if inspector.text_counts[sample] != 1 or html.count(sample) != 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Sample value for '{name}' must appear exactly once in an HTML text node",
            )
        html = html.replace(sample, "{{ " + name + " }}")
    return html


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
        text_body=data.text_body,
        from_local=data.from_local,
        from_name=data.from_name,
        reply_to=data.reply_to,
        variables=_validated_variables(data.body, data.subject, data.text_body, data.variables),
        on_missing_variable=data.on_missing_variable,
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
        text_body=source.text_body,
        from_local=source.from_local,
        from_name=source.from_name,
        reply_to=source.reply_to,
        variables=list(source.variables),
        on_missing_variable=source.on_missing_variable,
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
    body = update_data.get("body", template.body)
    subject = update_data.get("subject", template.subject)
    text_body = update_data.get("text_body", template.text_body)
    update_data["variables"] = _validated_variables(
        body, subject, text_body, update_data.get("variables")
    )
    for key, value in update_data.items():
        setattr(template, key, value)
    template.updated_at = utc_now()
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


async def upsert_template_by_name(
    db: AsyncSession,
    data: TemplateUpsert,
    *,
    name: str,
    channel: NotificationChannel,
    project_id: uuid.UUID,
    api_key_id: uuid.UUID,
) -> Template:
    """Create or replace one active project template identified by name and channel."""
    template = (
        await db.execute(
            select(Template).where(
                col(Template.project_id) == project_id,
                col(Template.name) == name,
                col(Template.channel) == channel,
                col(Template.is_active),
            )
        )
    ).scalar_one_or_none()
    if template is None:
        return await create_template(
            db,
            TemplateCreate(name=name, channel=channel, **data.model_dump()),
            project_id=project_id,
            api_key_id=api_key_id,
        )
    update_data = data.model_dump()
    if update_data["variables"] is None:
        del update_data["variables"]
    return await update_template(db, template, TemplateUpdate(**update_data))


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


def render_template_parts(
    template: Template, payload_vars: dict[str, Any]
) -> tuple[str | None, str, str | None]:
    """Render subject, channel body, and optional email plain text."""
    policy = getattr(template, "on_missing_variable", "blank")
    if policy not in ("error", "blank"):
        policy = "blank"
    text_body = template.text_body if isinstance(template.text_body, str) else None
    missing = sorted(
        set(detect_variables(template.body, template.subject, text_body)) - payload_vars.keys()
    )
    if missing and policy == "error":
        raise ValueError(f"Missing template variable(s): {', '.join(missing)}")

    text_env = _jinja_env_text_strict if policy == "error" else _jinja_env_text
    body_env = (
        _jinja_env_html_strict
        if policy == "error" and template.channel == NotificationChannel.EMAIL
        else _jinja_env_text_strict
        if policy == "error"
        else _jinja_env_html
        if template.channel == NotificationChannel.EMAIL
        else _jinja_env_text
    )
    rendered_subject = (
        text_env.from_string(template.subject).render(**payload_vars) if template.subject else None
    )
    rendered_body = body_env.from_string(template.body).render(**payload_vars)
    rendered_text = None
    if template.channel == NotificationChannel.EMAIL:
        rendered_text = (
            text_env.from_string(text_body).render(**payload_vars)
            if text_body
            else html_to_text(rendered_body)
        )
    return rendered_subject, rendered_body, rendered_text


def render_template(template: Template, payload_vars: dict[str, Any]) -> tuple[str | None, str]:
    """Render a template while preserving the original two-part return contract."""
    subject, body, _text = render_template_parts(template, payload_vars)
    return subject, body


def preview_template(
    body: str,
    subject: str | None,
    channel: NotificationChannel,
    variables: dict[str, Any],
) -> tuple[str | None, str]:
    rendered_subject = _jinja_env_text.from_string(subject).render(**variables) if subject else None
    env = _jinja_env_html if channel == NotificationChannel.EMAIL else _jinja_env_text
    rendered_body = env.from_string(body).render(**variables)
    return rendered_subject, rendered_body


def preview_template_parts(
    body: str,
    subject: str | None,
    text_body: str | None,
    channel: NotificationChannel,
    variables: dict[str, Any],
) -> tuple[str | None, str, str, list[str], list[str]]:
    """Render a non-strict preview and report supplied and missing variables."""
    detected = detect_variables(body, subject, text_body)
    used = sorted(set(detected) & variables.keys())
    missing = sorted(set(detected) - variables.keys())
    rendered_subject, rendered_body = preview_template(body, subject, channel, variables)
    rendered_text = (
        _jinja_env_text.from_string(text_body).render(**variables)
        if text_body
        else html_to_text(rendered_body)
    )
    return rendered_subject, rendered_body, rendered_text, used, missing
