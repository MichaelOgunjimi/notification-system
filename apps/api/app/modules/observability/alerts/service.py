"""Alert rule CRUD — a project's own delivery-health monitoring rules."""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.datetime import utc_now
from app.core.pagination import Page
from app.modules.observability.alerts.model import AlertRule
from app.modules.observability.alerts.schemas import AlertRuleCreate, AlertRuleUpdate


async def list_alert_rules_for_project(
    db: AsyncSession, *, project_id: uuid.UUID, page: int, per_page: int
) -> Page[AlertRule]:
    filters: list[Any] = [col(AlertRule.project_id) == project_id]
    total = int(
        (await db.execute(select(func.count()).select_from(AlertRule).where(*filters))).scalar()
        or 0
    )
    result = await db.execute(
        select(AlertRule)
        .where(*filters)
        .order_by(col(AlertRule.created_at).desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return Page(items=list(result.scalars().all()), total=total, page=page, per_page=per_page)


async def create_alert_rule(
    db: AsyncSession, data: AlertRuleCreate, *, project_id: uuid.UUID
) -> AlertRule:
    rule = AlertRule(
        project_id=project_id,
        name=data.name,
        metric=data.metric,
        threshold=data.threshold,
        window_minutes=data.window_minutes,
        notify_email=data.notify_email,
        is_active=data.is_active,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def get_project_alert_rule(
    db: AsyncSession, rule_id: uuid.UUID, *, project_id: uuid.UUID
) -> AlertRule | None:
    """Return the rule only if this project owns it."""
    result = await db.execute(
        select(AlertRule).where(
            col(AlertRule.id) == rule_id,
            col(AlertRule.project_id) == project_id,
        )
    )
    return result.scalar_one_or_none()


async def update_alert_rule(db: AsyncSession, rule: AlertRule, data: AlertRuleUpdate) -> AlertRule:
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    rule.updated_at = utc_now()
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def delete_alert_rule(db: AsyncSession, rule: AlertRule) -> None:
    await db.delete(rule)
