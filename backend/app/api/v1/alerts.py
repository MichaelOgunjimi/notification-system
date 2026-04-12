"""Alert rule endpoints."""

import uuid

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlmodel import col

from app.api.deps import ApiKeyDep, SessionDep
from app.models.alert import AlertRule
from app.schemas.alerts import AlertRuleCreate, AlertRuleResponse, AlertRuleUpdate
from app.utils.audit import log_action

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertRuleResponse])
async def list_alert_rules(
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
) -> list[AlertRuleResponse]:
    result = await db.execute(
        select(AlertRule)
        .where(col(AlertRule.api_key_id) == api_key.id)
        .order_by(col(AlertRule.created_at).desc())
    )
    return [AlertRuleResponse.model_validate(item) for item in result.scalars().all()]


@router.post("", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(
    body: AlertRuleCreate,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
) -> AlertRuleResponse:
    rule = AlertRule(api_key_id=api_key.id, **body.model_dump())
    db.add(rule)
    await db.flush()
    await log_action(
        db,
        api_key_id=api_key.id,
        action="alert_rule.created",
        resource_type="alert_rule",
        resource_id=str(rule.id),
        metadata={"name": rule.name, "metric": rule.metric},
        ip_address=request.client.host if request.client else None,
    )
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
    request: Request,
) -> AlertRuleResponse:
    result = await db.execute(
        select(AlertRule).where(
            col(AlertRule.id) == rule_id,
            col(AlertRule.api_key_id) == api_key.id,
        )
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")

    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    db.add(rule)
    await db.flush()
    await log_action(
        db,
        api_key_id=api_key.id,
        action="alert_rule.updated",
        resource_type="alert_rule",
        resource_id=str(rule.id),
        metadata={"name": rule.name, "metric": rule.metric},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(
    rule_id: uuid.UUID,
    *,
    db: SessionDep,
    api_key: ApiKeyDep,
    request: Request,
) -> None:
    result = await db.execute(
        select(AlertRule).where(
            col(AlertRule.id) == rule_id,
            col(AlertRule.api_key_id) == api_key.id,
        )
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")
    await db.delete(rule)
    await db.flush()
    await log_action(
        db,
        api_key_id=api_key.id,
        action="alert_rule.deleted",
        resource_type="alert_rule",
        resource_id=str(rule_id),
        metadata={"name": rule.name, "metric": rule.metric},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
