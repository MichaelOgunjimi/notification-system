"""Seed script — populate the database with sample data for development.

Usage:
    cd apps/api && uv run python -m scripts.seed
"""

import asyncio
import sys
from pathlib import Path

from sqlmodel import col

# Ensure apps/api is on sys.path so ``app`` is importable when running as a module.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import generate_api_key, hash_api_key
from app.core.database import async_session, engine
from app.modules.credentials.model import ApiKey
from app.modules.credentials.types import ALL_API_KEY_SCOPES
from app.modules.delivery.settings.channel_model import ChannelConfig
from app.modules.delivery.settings.retry_model import RetryPolicy
from app.modules.events.enums import EventPriority, EventStatus
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationChannel, NotificationStatus
from app.modules.notifications.model import Notification
from app.modules.templates.model import Template
from scripts.import_legacy_workspace import ensure_workspace_project


async def seed_api_key(db: AsyncSession) -> ApiKey:
    """Create a test API key if none exists. Returns the ApiKey row."""
    result = await db.execute(select(ApiKey).where(col(ApiKey.name) == "seed-dev-key"))
    existing = result.scalar_one_or_none()
    if existing is not None:
        print(f"  ✓ API key already exists (prefix: {existing.key_prefix}…)")
        return existing

    owner, _organization, project = await ensure_workspace_project(
        db,
        email="me@michaelogunjimi.com",
        owner_name="Michael",
        organization_name="Michael's Workspace",
        organization_slug="michael-workspace",
        project_name="Default",
        project_slug="default",
    )
    raw_key = generate_api_key()
    api_key = ApiKey(
        project_id=project.id,
        created_by_user_id=owner.id,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:10],
        name="seed-dev-key",
        description="Auto-generated development API key",
        scopes=list(ALL_API_KEY_SCOPES),
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
            "body": ("<h2>{{ title }}</h2><p>Severity: {{ severity }}</p><p>{{ message }}</p>"),
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
    """Create retry policies for each channel with differentiated defaults."""
    defaults = {
        NotificationChannel.EMAIL: {
            "max_retries": 3,
            "base_delay_seconds": 30,
            "max_backoff_seconds": 300,
        },
        NotificationChannel.SMS: {
            "max_retries": 3,
            "base_delay_seconds": 60,
            "max_backoff_seconds": 600,
        },
        NotificationChannel.WEBHOOK: {
            "max_retries": 5,
            "base_delay_seconds": 10,
            "max_backoff_seconds": 600,
        },
    }
    for channel, config in defaults.items():
        result = await db.execute(select(RetryPolicy).where(col(RetryPolicy.channel) == channel))
        if result.scalar_one_or_none() is not None:
            print(f"  ✓ Retry policy for '{channel}' already exists")
            continue

        policy = RetryPolicy(
            channel=channel,
            jitter_enabled=True,
            **config,
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


async def _clear_transactional_data(db: AsyncSession) -> None:
    """Delete all event/notification/log data so we can reseed cleanly."""
    from sqlalchemy import text as sa_text

    for table in (
        "dead_letter_messages",
        "notification_logs",
        "audit_logs",
        "api_key_usage",
        "notifications",
        "events",
    ):
        await db.execute(sa_text(f"DELETE FROM {table}"))
    print("  ✗ Cleared old transactional data")


async def seed_sample_events(db: AsyncSession, api_key: ApiKey) -> None:
    """Create realistic events + notifications spread across the last 30 days."""
    import random
    from datetime import timedelta

    from app.core.datetime import utc_now as _utc_now

    await _clear_transactional_data(db)

    now = _utc_now()
    rng = random.Random(42)  # deterministic for reproducibility

    event_types = [
        "user.signup",
        "user.password_reset",
        "user.email_verified",
        "order.created",
        "order.shipped",
        "order.delivered",
        "order.refunded",
        "payment.success",
        "payment.failed",
        "alert.security",
        "alert.threshold",
        "verify.phone",
        "verify.email",
        "report.generated",
        "invoice.sent",
    ]
    channels_for_type = {
        "user.signup": NotificationChannel.EMAIL,
        "user.password_reset": NotificationChannel.EMAIL,
        "user.email_verified": NotificationChannel.EMAIL,
        "order.created": NotificationChannel.EMAIL,
        "order.shipped": NotificationChannel.EMAIL,
        "order.delivered": NotificationChannel.WEBHOOK,
        "order.refunded": NotificationChannel.EMAIL,
        "payment.success": NotificationChannel.WEBHOOK,
        "payment.failed": NotificationChannel.EMAIL,
        "alert.security": NotificationChannel.SMS,
        "alert.threshold": NotificationChannel.WEBHOOK,
        "verify.phone": NotificationChannel.SMS,
        "verify.email": NotificationChannel.EMAIL,
        "report.generated": NotificationChannel.EMAIL,
        "invoice.sent": NotificationChannel.EMAIL,
    }
    addresses = {
        NotificationChannel.EMAIL: [
            "alice@example.com",
            "bob@company.io",
            "charlie@startup.dev",
            "diana@enterprise.co",
            "eve@agency.net",
        ],
        NotificationChannel.SMS: ["+15559876543", "+15551234567", "+447700900123"],
        NotificationChannel.WEBHOOK: [
            "https://hooks.company.io/notify",
            "https://api.startup.dev/webhooks/beaco",
            "https://internal.enterprise.co/events",
        ],
    }
    priorities_weighted = [
        (EventPriority.HIGH, 3),
        (EventPriority.MEDIUM, 5),
        (EventPriority.LOW, 2),
    ]

    def pick_priority() -> EventPriority:
        return rng.choices(
            [p for p, _ in priorities_weighted],
            weights=[w for _, w in priorities_weighted],
        )[0]

    # Statuses: most delivered, some failed, a few pending/processing
    def pick_notif_outcome(age_hours: float) -> tuple[NotificationStatus, EventStatus]:
        """Return (notif_status, event_status) with realistic distribution."""
        r = rng.random()
        if age_hours < 0.5:
            # Very recent: still processing
            if r < 0.4:
                return NotificationStatus.PENDING, EventStatus.ACCEPTED
            if r < 0.7:
                return NotificationStatus.PROCESSING, EventStatus.PROCESSING
            return NotificationStatus.DELIVERED, EventStatus.COMPLETED
        if r < 0.78:
            return NotificationStatus.DELIVERED, EventStatus.COMPLETED
        if r < 0.90:
            return NotificationStatus.FAILED, EventStatus.FAILED
        if r < 0.95:
            return NotificationStatus.PROCESSING, EventStatus.PROCESSING
        return NotificationStatus.PENDING, EventStatus.ACCEPTED

    total_events = 85
    created = 0

    for i in range(total_events):
        # Spread events: more recent events, fewer old ones (exponential)
        days_ago = rng.expovariate(0.15)
        days_ago = min(days_ago, 30)
        hours_offset = rng.uniform(0, 24)
        event_time = now - timedelta(days=days_ago, hours=hours_offset)

        event_type = rng.choice(event_types)
        priority = pick_priority()
        channel = channels_for_type[event_type]
        address = rng.choice(addresses[channel])
        age_hours = (now - event_time).total_seconds() / 3600
        notif_status, event_status = pick_notif_outcome(age_hours)
        recipient_count = rng.choice([1, 1, 1, 2, 3]) if i % 7 == 0 else 1

        event = Event(
            event_type=event_type,
            priority=priority,
            status=event_status,
            payload={"source": "seed", "index": i},
            api_key_id=api_key.id,
            recipient_count=recipient_count,
            created_at=event_time,
            updated_at=event_time,
        )
        db.add(event)
        await db.flush()

        for r in range(recipient_count):
            addr = rng.choice(addresses[channel]) if r > 0 else address
            latency_ms = (
                rng.uniform(80, 4500) if notif_status == NotificationStatus.DELIVERED else None
            )
            delivered_at = event_time + timedelta(milliseconds=latency_ms) if latency_ms else None
            failed_at = (
                event_time + timedelta(seconds=rng.uniform(1, 30))
                if notif_status == NotificationStatus.FAILED
                else None
            )
            queued_at = event_time + timedelta(milliseconds=rng.uniform(5, 50))
            processing_at = (
                queued_at + timedelta(milliseconds=rng.uniform(10, 200))
                if notif_status != NotificationStatus.PENDING
                else None
            )

            notif = Notification(
                event_id=event.id,
                channel=channel,
                status=notif_status,
                priority=priority,
                recipient_user_id=addr,
                recipient_address=addr,
                retry_count=rng.randint(0, 3) if notif_status == NotificationStatus.FAILED else 0,
                created_at=event_time,
                queued_at=queued_at,
                processing_started_at=processing_at,
                delivered_at=delivered_at,
                failed_at=failed_at,
                error_message=(
                    "Connection timeout" if notif_status == NotificationStatus.FAILED else None
                ),
                updated_at=delivered_at or failed_at or processing_at or queued_at or event_time,
            )
            db.add(notif)

        created += 1

    await db.flush()
    print(f"  ✓ Created {created} events with notifications across 30 days")


async def seed_notification_logs(db: AsyncSession) -> None:
    """Create delivery timeline logs for each notification."""
    from app.modules.notifications.log_model import NotificationLog

    result = await db.execute(select(Notification))
    notifications = result.scalars().all()
    count = 0

    for notification in notifications:
        db.add(
            NotificationLog(
                notification_id=notification.id,
                previous_status=None,
                new_status=NotificationStatus.PENDING,
                error_message="Notification created",
                created_at=notification.created_at,
            )
        )
        count += 1

        if notification.queued_at:
            db.add(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=NotificationStatus.PENDING,
                    new_status=NotificationStatus.QUEUED,
                    error_message="Added to delivery queue",
                    created_at=notification.queued_at,
                )
            )
            count += 1

        if notification.processing_started_at:
            db.add(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=NotificationStatus.QUEUED,
                    new_status=NotificationStatus.PROCESSING,
                    worker_id="worker-seed@dispatcher",
                    error_message="Picked up by worker",
                    created_at=notification.processing_started_at,
                )
            )
            count += 1

        if notification.delivered_at:
            db.add(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=NotificationStatus.PROCESSING,
                    new_status=NotificationStatus.DELIVERED,
                    worker_id="worker-seed@dispatcher",
                    error_message="Successfully delivered",
                    provider_response={
                        "status": "ok",
                        "provider_id": f"prov_{notification.id.hex[:8]}",
                    },
                    created_at=notification.delivered_at,
                )
            )
            count += 1
        elif notification.failed_at:
            db.add(
                NotificationLog(
                    notification_id=notification.id,
                    previous_status=NotificationStatus.PROCESSING,
                    new_status=NotificationStatus.FAILED,
                    worker_id="worker-seed@dispatcher",
                    error_type="ConnectionTimeout",
                    error_message="Delivery failed: Connection timeout",
                    created_at=notification.failed_at,
                )
            )
            count += 1

    await db.flush()
    print(f"  ✓ Created {count} notification log entries")


async def seed_dlq_entries(db: AsyncSession) -> None:
    """Create dead letter queue entries from failed notifications."""
    import random
    from datetime import timedelta

    from app.modules.delivery.dead_letter.model import DeadLetterMessage
    from app.modules.delivery.enums import DeadLetterStatus

    result = await db.execute(
        select(Notification).where(col(Notification.status) == NotificationStatus.FAILED)
    )
    failed_notifications = result.scalars().all()
    rng = random.Random(55)
    count = 0

    for notification in failed_notifications:
        event_result = await db.execute(select(Event).where(col(Event.id) == notification.event_id))
        event = event_result.scalar_one_or_none()
        failure_time = notification.failed_at or notification.created_at

        status = rng.choice(
            [
                DeadLetterStatus.ACTIVE,
                DeadLetterStatus.ACTIVE,
                DeadLetterStatus.ACTIVE,
                DeadLetterStatus.RETRIED,
                DeadLetterStatus.DISCARDED,
            ]
        )

        db.add(
            DeadLetterMessage(
                notification_id=notification.id,
                channel=notification.channel,
                recipient_address=notification.recipient_address,
                event_payload=event.payload if event else {},
                error_type="ConnectionTimeout",
                error_message=notification.error_message or "Connection timeout",
                retry_count=notification.retry_count,
                retry_history=[
                    {
                        "attempt": index + 1,
                        "error": "Connection timeout",
                        "timestamp": str(notification.created_at + timedelta(minutes=index * 5)),
                    }
                    for index in range(notification.retry_count)
                ],
                status=status,
                failed_at=failure_time,
                retried_at=(
                    failure_time + timedelta(hours=1)
                    if status == DeadLetterStatus.RETRIED
                    else None
                ),
                discarded_at=(
                    failure_time + timedelta(hours=2)
                    if status == DeadLetterStatus.DISCARDED
                    else None
                ),
                created_at=failure_time,
            )
        )
        count += 1

    await db.flush()
    print(f"  ✓ Created {count} dead letter queue entries")


async def seed_audit_logs(db: AsyncSession, api_key: ApiKey) -> None:
    """Create realistic audit log entries spread across the last 30 days."""
    import random
    from datetime import timedelta

    from app.core.datetime import utc_now as _utc_now
    from app.modules.observability.audit.model import AuditLog

    now = _utc_now()
    rng = random.Random(99)

    actions = [
        ("event.created", "event"),
        ("event.completed", "event"),
        ("event.failed", "event"),
        ("notification.sent", "notification"),
        ("notification.delivered", "notification"),
        ("notification.failed", "notification"),
        ("notification.retried", "notification"),
        ("api_key.created", "api_key"),
        ("api_key.rotated", "api_key"),
        ("template.created", "template"),
        ("template.updated", "template"),
        ("suppression.created", "suppression"),
        ("alert_rule.triggered", "alert_rule"),
        ("config.updated", "channel_config"),
    ]
    ips = ["192.168.1.10", "10.0.0.5", "172.16.0.100", "203.0.113.42", "198.51.100.7"]

    count = 0
    for i in range(120):
        days_ago = rng.expovariate(0.18)
        days_ago = min(days_ago, 30)
        hours_offset = rng.uniform(0, 24)
        log_time = now - timedelta(days=days_ago, hours=hours_offset)

        action, resource_type = rng.choice(actions)

        # Build meaningful metadata per action type
        if action == "event.created":
            meta = {
                "event_type": rng.choice(["user.signup", "order.completed", "payment.received"]),
                "priority": rng.choice(["high", "medium", "low"]),
            }
        elif action == "event.completed":
            meta = {
                "duration_ms": rng.randint(80, 4500),
                "channel": rng.choice(["email", "sms", "webhook"]),
            }
        elif action == "event.failed":
            meta = {
                "error": rng.choice(["timeout", "invalid_payload", "rate_limited"]),
                "retry_count": rng.randint(0, 3),
            }
        elif action == "notification.sent":
            meta = {
                "channel": rng.choice(["email", "sms", "webhook"]),
                "recipient": f"user-{rng.randint(100, 999)}@example.com",
            }
        elif action == "notification.delivered":
            meta = {
                "channel": rng.choice(["email", "sms", "webhook"]),
                "latency_ms": rng.randint(45, 3200),
            }
        elif action == "notification.failed":
            meta = {
                "error": rng.choice(["SMTP timeout", "invalid number", "endpoint 503"]),
                "will_retry": rng.choice([True, False]),
            }
        elif action == "notification.retried":
            meta = {
                "attempt": rng.randint(1, 3),
                "previous_error": rng.choice(["timeout", "rate_limited"]),
            }
        elif action == "api_key.created":
            meta = {
                "key_name": f"key-{rng.randint(1, 20)}",
                "rate_limit": rng.choice([60, 120, 300]),
            }
        elif action == "api_key.rotated":
            meta = {"reason": rng.choice(["scheduled", "security_audit", "compromised"])}
        elif action == "template.created":
            meta = {
                "template_name": rng.choice(
                    ["welcome_email", "password_reset", "order_confirmation"]
                ),
                "channel": rng.choice(["email", "sms"]),
            }
        elif action == "template.updated":
            meta = {
                "template_name": rng.choice(["welcome_email", "alert_email"]),
                "fields_changed": rng.choice(["subject", "body", "variables"]),
            }
        elif action == "suppression.created":
            meta = {
                "address": f"blocked-{rng.randint(1, 50)}@example.com",
                "reason": rng.choice(["bounce", "complaint", "manual"]),
            }
        elif action == "alert_rule.triggered":
            meta = {
                "rule_name": rng.choice(["high_failure_rate", "queue_depth", "latency_spike"]),
                "threshold": rng.choice(["5%", "100ms", "50 items"]),
            }
        elif action == "config.updated":
            meta = {
                "channel": rng.choice(["email", "sms", "webhook"]),
                "field": rng.choice(["rate_limit", "timeout", "retry_policy"]),
            }
        else:
            meta = {}

        log = AuditLog(
            api_key_id=api_key.id,
            action=action,
            resource_type=resource_type,
            resource_id=str(rng.randint(1000, 9999)),
            metadata_=meta,
            ip_address=rng.choice(ips),
            created_at=log_time,
        )
        db.add(log)
        count += 1

    await db.flush()
    print(f"  ✓ Created {count} audit log entries across 30 days")


async def seed_usage_data(db: AsyncSession, api_key: ApiKey) -> None:
    """Create hourly API usage buckets spread across the last 30 days."""
    import random
    from datetime import datetime, timedelta

    from app.core.datetime import utc_now as _utc_now
    from app.modules.observability.usage.model import ApiKeyUsage

    now = _utc_now()
    rng = random.Random(77)

    endpoints = [
        ("/api/v1/events", "POST", 201),
        ("/api/v1/events", "POST", 400),
        ("/api/v1/events", "GET", 200),
        ("/api/v1/notifications", "GET", 200),
        ("/api/v1/events/batch", "POST", 201),
        ("/api/v1/templates", "GET", 200),
        ("/api/v1/analytics", "GET", 200),
    ]

    # Build hourly buckets for the last 30 days — not every hour, but
    # concentrate more buckets in recent days
    count = 0
    for days_ago in range(30, -1, -1):
        # More active hours on recent days
        if days_ago <= 1:
            active_hours = rng.sample(range(24), k=rng.randint(12, 18))
        elif days_ago <= 7:
            active_hours = rng.sample(range(24), k=rng.randint(6, 14))
        else:
            active_hours = rng.sample(range(24), k=rng.randint(2, 8))

        for hour in active_hours:
            bucket = datetime(
                now.year,
                now.month,
                now.day,
                hour,
                0,
                0,
                tzinfo=UTC,
            ) - timedelta(days=days_ago)

            # Pick 1-3 endpoint combos for this hour
            chosen = rng.sample(endpoints, k=min(rng.randint(1, 3), len(endpoints)))
            for endpoint, method, status_code in chosen:
                request_count = rng.randint(1, 25) if status_code < 400 else rng.randint(1, 3)
                usage = ApiKeyUsage(
                    api_key_id=api_key.id,
                    endpoint=endpoint,
                    method=method,
                    status_code=status_code,
                    hour_bucket=bucket,
                    request_count=request_count,
                )
                db.add(usage)
                count += 1

    await db.flush()
    print(f"  ✓ Created {count} usage buckets across 30 days")


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

        print("\n[Notification Logs]")
        await seed_notification_logs(db)

        print("\n[Dead Letter Queue]")
        await seed_dlq_entries(db)

        print("\n[Audit Logs]")
        await seed_audit_logs(db, api_key)

        print("\n[API Usage]")
        await seed_usage_data(db, api_key)

        await db.commit()

    await engine.dispose()
    print("\n✅ Seed complete!\n")


if __name__ == "__main__":
    asyncio.run(main())
