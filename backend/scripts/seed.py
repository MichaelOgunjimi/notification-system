"""Seed script — populate the database with sample data for development.

Usage:
    cd backend && uv run python -m scripts.seed
"""

import asyncio
import sys
from pathlib import Path

from sqlmodel import col

# Ensure backend/ is on sys.path so ``app`` is importable when running as a module.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, engine
from app.models.api_key import ApiKey
from app.models.channel_config import ChannelConfig
from app.models.enums import (
    EventPriority,
    EventStatus,
    NotificationChannel,
    NotificationStatus,
)
from app.models.event import Event
from app.models.notification import Notification
from app.models.retry_policy import RetryPolicy
from app.models.template import Template
from app.utils.crypto import generate_api_key, hash_api_key
from app.utils.datetime import utc_now


async def seed_api_key(db: AsyncSession) -> ApiKey:
    """Create a test API key if none exists. Returns the ApiKey row."""
    result = await db.execute(select(ApiKey).where(col(ApiKey.name) == "seed-dev-key"))
    existing = result.scalar_one_or_none()
    if existing is not None:
        print(f"  ✓ API key already exists (prefix: {existing.key_prefix}…)")
        return existing

    raw_key = generate_api_key()
    api_key = ApiKey(
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:10],
        name="seed-dev-key",
        description="Auto-generated development API key",
    )
    db.add(api_key)
    await db.flush()
    print("  ✓ Created API key — copy this, it won't be shown again:")
    print(f"    {raw_key}")
    return api_key


async def seed_templates(db: AsyncSession) -> list[Template]:
    """Create sample notification templates (idempotent)."""
    templates_data = [
        {
            "name": "welcome_email",
            "channel": NotificationChannel.EMAIL,
            "subject": "Welcome to {{ app_name }}, {{ user_name }}!",
            "body": (
                "<h1>Welcome, {{ user_name }}!</h1>"
                "<p>Thanks for joining {{ app_name }}. "
                "We're excited to have you on board.</p>"
            ),
            "variables": ["app_name", "user_name"],
        },
        {
            "name": "alert_email",
            "channel": NotificationChannel.EMAIL,
            "subject": "[{{ severity }}] Alert: {{ title }}",
            "body": (
                "<h2>{{ title }}</h2>"
                "<p>Severity: {{ severity }}</p>"
                "<p>{{ message }}</p>"
            ),
            "variables": ["severity", "title", "message"],
        },
        {
            "name": "sms_verification",
            "channel": NotificationChannel.SMS,
            "subject": None,
            "body": "Your verification code is {{ code }}. Expires in {{ minutes }} minutes.",
            "variables": ["code", "minutes"],
        },
    ]

    created: list[Template] = []
    for tdata in templates_data:
        result = await db.execute(
            select(Template).where(
                Template.name == tdata["name"],
                Template.channel == tdata["channel"],
            )
        )
        if result.scalar_one_or_none() is not None:
            print(f"  ✓ Template '{tdata['name']}' already exists")
            continue

        template = Template(**tdata)
        db.add(template)
        await db.flush()
        created.append(template)
        print(f"  ✓ Created template '{tdata['name']}' ({tdata['channel']})")

    return created


async def seed_retry_policies(db: AsyncSession) -> None:
    """Create retry policies for each channel."""
    for channel in NotificationChannel:
        result = await db.execute(
            select(RetryPolicy).where(col(RetryPolicy.channel) == channel)
        )
        if result.scalar_one_or_none() is not None:
            print(f"  ✓ Retry policy for '{channel}' already exists")
            continue

        policy = RetryPolicy(
            channel=channel,
            max_retries=5,
            base_delay_seconds=10,
            max_backoff_seconds=600,
            jitter_enabled=True,
        )
        db.add(policy)
        await db.flush()
        print(f"  ✓ Created retry policy for '{channel}'")


async def seed_channel_configs(db: AsyncSession) -> None:
    """Create default channel configs."""
    configs = {
        NotificationChannel.EMAIL: {"provider": "resend", "from_address": "noreply@example.com"},
        NotificationChannel.SMS: {"provider": "twilio", "from_number": "+15551234567"},
        NotificationChannel.WEBHOOK: {"timeout_seconds": 30, "max_redirects": 3},
    }
    for channel, config in configs.items():
        result = await db.execute(
            select(ChannelConfig).where(col(ChannelConfig.channel) == channel)
        )
        if result.scalar_one_or_none() is not None:
            print(f"  ✓ Channel config for '{channel}' already exists")
            continue

        cc = ChannelConfig(channel=channel, config=config)
        db.add(cc)
        await db.flush()
        print(f"  ✓ Created channel config for '{channel}'")


async def seed_sample_events(db: AsyncSession, api_key: ApiKey) -> None:
    """Create a handful of sample events with notifications."""
    result = await db.execute(select(Event).limit(1))
    if result.scalar_one_or_none() is not None:
        print("  ✓ Sample events already exist")
        return

    samples = [
        ("user.signup", EventPriority.HIGH, "alice@example.com", NotificationChannel.EMAIL),
        ("order.shipped", EventPriority.MEDIUM, "bob@example.com", NotificationChannel.EMAIL),
        ("verify.phone", EventPriority.HIGH, "+15559876543", NotificationChannel.SMS),
    ]

    for event_type, priority, address, channel in samples:
        event = Event(
            event_type=event_type,
            priority=priority,
            status=EventStatus.ACCEPTED,
            payload={"source": "seed"},
            api_key_id=api_key.id,
            recipient_count=1,
        )
        db.add(event)
        await db.flush()

        notification = Notification(
            event_id=event.id,
            channel=channel,
            status=NotificationStatus.PENDING,
            priority=priority,
            recipient_user_id=address,
            recipient_address=address,
        )
        db.add(notification)
        await db.flush()
        print(f"  ✓ Created event '{event_type}' → notification ({channel})")


async def main() -> None:
    print("\n🌱 Seeding database…\n")

    async with async_session() as db:
        print("[API Keys]")
        api_key = await seed_api_key(db)

        print("\n[Templates]")
        await seed_templates(db)

        print("\n[Retry Policies]")
        await seed_retry_policies(db)

        print("\n[Channel Configs]")
        await seed_channel_configs(db)

        print("\n[Sample Events]")
        await seed_sample_events(db, api_key)

        await db.commit()

    await engine.dispose()
    print("\n✅ Seed complete!\n")


if __name__ == "__main__":
    asyncio.run(main())
