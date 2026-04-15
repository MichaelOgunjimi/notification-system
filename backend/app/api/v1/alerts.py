"""Alert rule endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlmodel import col

from app.api.deps import ApiKeyDep, SessionDep, is_master_key
from app.models.alert_rule import AlertRule

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertRuleResponse(BaseModel):
    id: uuid.UUID
    api_key_id: uuid.UUID
    name: str
    metric: str
    threshold: float
    window_minutes: int
    notify_email: str | None
    is_active: bool
    last_triggered_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertRuleCreate(BaseModel):
    name: str = Field(max_length=255)
    metric: str = Field(max_length=100)
    threshold: float
    window_minutes: int = 60
    notify_email: EmailStr | None = None
    is_active: bool = True


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    metric: str | None = None
    threshold: float | None = None
    window_minutes: int | None = None
    notify_email: EmailStr | None = None
    is_active: bool | None = None


@router.get("", response_model=list[AlertRuleResponse])
async def list_alert_rules(*, db: SessionDep, api_key: ApiKeyDep) -> list[AlertRuleResponse]:
    query = select(AlertRule).order_by(col(AlertRule.created_at).desc())
    if not is_master_key(api_key):
        query = query.where(col(AlertRule.api_key_id) == api_key.id)
    items = (await db.execute(query)).scalars().all()
    return [AlertRuleResponse.model_validate(item) for item in items]


@router.post("", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(
    body: AlertRuleCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> AlertRuleResponse:
    if is_master_key(api_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Use a project key to create alerts",
        )

    rule = AlertRule(
        api_key_id=api_key.id,
        name=body.name,
        metric=body.metric,
        threshold=body.threshold,
        window_minutes=body.window_minutes,
        notify_email=body.notify_email,
        is_active=body.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


@router.put("/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: uuid.UUID,
    body: AlertRuleUpdate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> AlertRuleResponse:
    rule = (
        await db.execute(select(AlertRule).where(col(AlertRule.id) == rule_id))
    ).scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")
    if not is_master_key(api_key) and rule.api_key_id != api_key.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(
    rule_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> None:
    rule = (
        await db.execute(select(AlertRule).where(col(AlertRule.id) == rule_id))
    ).scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")
    if not is_master_key(api_key) and rule.api_key_id != api_key.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")

    await db.delete(rule)
    await db.commit()
