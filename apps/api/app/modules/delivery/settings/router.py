"""Delivery settings endpoints — channel configuration and retry policies."""

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select
from sqlmodel import col

from app.core.http.dependencies import SessionDep
from app.modules.credentials.dependencies import SettingsReadApiKeyDep
from app.modules.delivery.settings.channel_model import ChannelConfig as ChannelConfigModel
from app.modules.delivery.settings.retry_model import RetryPolicy as RetryPolicyModel

_EPOCH = datetime(2024, 1, 1, tzinfo=UTC).isoformat()


class ChannelConfig(BaseModel):
    id: str
    channel: str
    is_enabled: bool
    rate_limit_per_min: int | None
    created_at: str
    updated_at: str


class RetryPolicy(BaseModel):
    id: str
    channel: str
    max_retries: int
    base_delay_seconds: int
    max_backoff_seconds: int
    jitter_enabled: bool
    retry_on_timeout: bool
    retry_on_5xx: bool
    retry_on_4xx: bool
    created_at: str
    updated_at: str


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/channels", response_model=list[ChannelConfig])
async def list_channel_configs(
    *,
    db: SessionDep,
    _: SettingsReadApiKeyDep,
) -> list[ChannelConfig]:
    result = await db.execute(select(ChannelConfigModel).order_by(col(ChannelConfigModel.channel)))
    configs = result.scalars().all()
    return [
        ChannelConfig(
            id=str(config.id),
            channel=str(config.channel.value),
            is_enabled=config.is_enabled,
            rate_limit_per_min=config.rate_limit_per_min,
            created_at=config.created_at.isoformat() if config.created_at else _EPOCH,
            updated_at=config.updated_at.isoformat() if config.updated_at else _EPOCH,
        )
        for config in configs
    ]


@router.get("/retry-policies", response_model=list[RetryPolicy])
async def list_retry_policies(
    *,
    db: SessionDep,
    _: SettingsReadApiKeyDep,
) -> list[RetryPolicy]:
    result = await db.execute(select(RetryPolicyModel).order_by(col(RetryPolicyModel.channel)))
    policies = result.scalars().all()
    return [
        RetryPolicy(
            id=str(policy.id),
            channel=str(policy.channel.value),
            max_retries=policy.max_retries,
            base_delay_seconds=policy.base_delay_seconds,
            max_backoff_seconds=policy.max_backoff_seconds,
            jitter_enabled=policy.jitter_enabled,
            retry_on_timeout=policy.retry_on_timeout,
            retry_on_5xx=policy.retry_on_5xx,
            retry_on_4xx=policy.retry_on_4xx,
            created_at=policy.created_at.isoformat() if policy.created_at else _EPOCH,
            updated_at=policy.updated_at.isoformat() if policy.updated_at else _EPOCH,
        )
        for policy in policies
    ]
