"""Seed script — populate Ensomble demo data for a second API key.

This is a temporary script that creates realistic notification data
as if the Ensomble musician-booking marketplace were a Beaco customer.

Usage:
    cd backend && POSTGRES_PORT=5433 uv run python -m scripts.seed_ensomble
"""

import asyncio
import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col

from app.core.database import async_session, engine
from app.models.api_key import ApiKey
from app.models.audit_log import AuditLog
from app.models.dead_letter import DeadLetterMessage
from app.models.enums import (
    DeadLetterStatus,
    EventPriority,
    EventStatus,
    NotificationChannel,
    NotificationStatus,
)
from app.models.event import Event
from app.models.notification import Notification
from app.models.notification_log import NotificationLog
from app.models.usage import ApiKeyUsage
from app.utils.crypto import hash_api_key
from app.utils.datetime import utc_now

RAW_KEY = "nk_ohEuZkwEiuUwe8gn6K1jjoq8pOOPN9ITLJUGfWqx-UA"
KEY_NAME = "ensomble-prod"

# ── Ensomble domain data ─────────────────────────────────────────────────────

EVENT_TYPES = [
    # Customer flow
    "customer.signup",
    "customer.email_verified",
    "customer.password_reset",
    # Musician flow
    "musician.signup",
    "musician.onboarding_complete",
    "musician.approved",
    "musician.rejected",
    "musician.profile_updated",
    # Booking flow
    "booking.requested",
    "booking.confirmed",
    "booking.declined",
    "booking.cancelled",
    "booking.completed",
    # Payment flow
    "payment.received",
    "payment.escrow_released",
    "payment.refund_initiated",
    "payment.payout_sent",
    # Messaging
    "message.received",
    # Reviews
    "review.submitted",
    "review.flagged",
    # Admin
    "dispute.opened",
    "dispute.resolved",
]

CHANNEL_MAP: dict[str, NotificationChannel] = {
    "customer.signup": NotificationChannel.EMAIL,
    "customer.email_verified": NotificationChannel.EMAIL,
    "customer.password_reset": NotificationChannel.EMAIL,
    "musician.signup": NotificationChannel.EMAIL,
    "musician.onboarding_complete": NotificationChannel.EMAIL,
    "musician.approved": NotificationChannel.EMAIL,
    "musician.rejected": NotificationChannel.EMAIL,
    "musician.profile_updated": NotificationChannel.WEBHOOK,
    "booking.requested": NotificationChannel.EMAIL,
    "booking.confirmed": NotificationChannel.EMAIL,
    "booking.declined": NotificationChannel.EMAIL,
    "booking.cancelled": NotificationChannel.EMAIL,
    "booking.completed": NotificationChannel.WEBHOOK,
    "payment.received": NotificationChannel.EMAIL,
    "payment.escrow_released": NotificationChannel.WEBHOOK,
    "payment.refund_initiated": NotificationChannel.EMAIL,
    "payment.payout_sent": NotificationChannel.EMAIL,
    "message.received": NotificationChannel.EMAIL,
    "review.submitted": NotificationChannel.EMAIL,
    "review.flagged": NotificationChannel.WEBHOOK,
    "dispute.opened": NotificationChannel.EMAIL,
    "dispute.resolved": NotificationChannel.EMAIL,
}

PRIORITY_MAP: dict[str, EventPriority] = {
    "customer.signup": EventPriority.MEDIUM,
    "customer.email_verified": EventPriority.LOW,
    "customer.password_reset": EventPriority.HIGH,
    "musician.signup": EventPriority.MEDIUM,
    "musician.onboarding_complete": EventPriority.MEDIUM,
    "musician.approved": EventPriority.HIGH,
    "musician.rejected": EventPriority.HIGH,
    "musician.profile_updated": EventPriority.LOW,
    "booking.requested": EventPriority.HIGH,
    "booking.confirmed": EventPriority.HIGH,
    "booking.declined": EventPriority.MEDIUM,
    "booking.cancelled": EventPriority.HIGH,
    "booking.completed": EventPriority.MEDIUM,
    "payment.received": EventPriority.HIGH,
    "payment.escrow_released": EventPriority.MEDIUM,
    "payment.refund_initiated": EventPriority.HIGH,
    "payment.payout_sent": EventPriority.HIGH,
    "message.received": EventPriority.LOW,
    "review.submitted": EventPriority.LOW,
    "review.flagged": EventPriority.MEDIUM,
    "dispute.opened": EventPriority.HIGH,
    "dispute.resolved": EventPriority.MEDIUM,
}

CUSTOMERS = [
    "emma.wilson@gmail.com",
    "james.patel@outlook.com",
    "sophie.chen@yahoo.co.uk",
    "oliver.brown@hotmail.com",
    "charlotte.davies@icloud.com",
    "harry.thompson@proton.me",
    "amelia.jones@gmail.com",
    "george.martinez@outlook.com",
]

MUSICIANS = [
    "alex.rivera.music@gmail.com",
    "thejazzquartet@outlook.com",
    "sarah.strings@gmail.com",
    "functionbanduk@hotmail.com",
    "djmarcus@proton.me",
    "acoustic.duo.london@gmail.com",
]

WEBHOOK_URLS = [
    "https://api.ensomble.com/webhooks/beaco",
    "https://hooks.ensomble.com/events",
    "https://internal.ensomble.com/notifications",
]

ADDRESSES: dict[NotificationChannel, list[str]] = {
    NotificationChannel.EMAIL: CUSTOMERS + MUSICIANS,
    NotificationChannel.SMS: ["+447700900123", "+447911123456", "+447822345678"],
    NotificationChannel.WEBHOOK: WEBHOOK_URLS,
}

BOOKING_VENUES = [
    "The Ritz London",
    "Claridge's Ballroom",
    "Kew Gardens Orangery",
    "Hampton Court Palace",
    "The Savoy",
    "Blenheim Palace",
    "Edinburgh Castle",
    "Manchester Town Hall",
    "Bath Assembly Rooms",
    "Brighton Bandstand",
    "Bristol Harbour Hotel",
    "Liverpool Philharmonic",
]

MUSICIAN_NAMES = [
    "Alex Rivera (Solo Pianist)",
    "The Jazz Quartet",
    "Sarah Strings (Violinist)",
    "The Function Band UK",
    "DJ Marcus",
    "Acoustic Duo London",
    "Celtic Ensemble",
    "The Wedding Singers",
    "Chamber Trio Bristol",
]


def _make_payload(rng: random.Random, event_type: str, index: int) -> dict:
    """Build a realistic-looking event payload for the given type."""
    if event_type.startswith("customer."):
        return {
            "source": "ensomble",
            "customer_id": str(uuid.uuid4()),
            "email": rng.choice(CUSTOMERS),
        }
    if event_type.startswith("musician."):
        return {
            "source": "ensomble",
            "musician_id": str(uuid.uuid4()),
            "email": rng.choice(MUSICIANS),
            "stage_name": rng.choice(MUSICIAN_NAMES),
        }
    if event_type.startswith("booking."):
        return {
            "source": "ensomble",
            "booking_id": f"BK-{1000 + index}",
            "customer_email": rng.choice(CUSTOMERS),
            "musician": rng.choice(MUSICIAN_NAMES),
            "venue": rng.choice(BOOKING_VENUES),
            "date": (utc_now() + timedelta(days=rng.randint(7, 90))).strftime("%Y-%m-%d"),
            "amount_gbp": rng.choice([250, 350, 500, 750, 1200, 1800, 2500]),
        }
    if event_type.startswith("payment."):
        return {
            "source": "ensomble",
            "payment_id": f"pi_{uuid.uuid4().hex[:16]}",
            "amount_gbp": rng.choice([250, 350, 500, 750, 1200]),
            "currency": "GBP",
        }
    if event_type == "message.received":
        return {
            "source": "ensomble",
            "conversation_id": str(uuid.uuid4()),
            "from": rng.choice(CUSTOMERS + MUSICIANS),
            "preview": rng.choice(
                [
                    "Hi, are you available for a wedding on June 14th?",
                    "Thanks for the booking! Looking forward to it.",
                    "Can you play jazz standards for cocktail hour?",
                    "What equipment do you need us to provide?",
                    "Just confirming the set list for Saturday.",
                ]
            ),
        }
    if event_type.startswith("review."):
        return {
            "source": "ensomble",
            "review_id": str(uuid.uuid4()),
            "rating": rng.randint(1, 5),
            "musician": rng.choice(MUSICIAN_NAMES),
        }
    if event_type.startswith("dispute."):
        return {
            "source": "ensomble",
            "dispute_id": str(uuid.uuid4()),
            "reason": rng.choice(
                [
                    "Musician no-show",
                    "Late arrival",
                    "Wrong set list",
                    "Equipment damage",
                    "Customer cancelled day-of",
                ]
            ),
        }
    return {"source": "ensomble", "index": index}


def _pick_outcome(rng: random.Random, age_hours: float) -> tuple[NotificationStatus, EventStatus]:
    r = rng.random()
    if age_hours < 0.5:
        if r < 0.35:
            return NotificationStatus.PENDING, EventStatus.ACCEPTED
        if r < 0.65:
            return NotificationStatus.PROCESSING, EventStatus.PROCESSING
        return NotificationStatus.DELIVERED, EventStatus.COMPLETED
    if r < 0.82:
        return NotificationStatus.DELIVERED, EventStatus.COMPLETED
    if r < 0.92:
        return NotificationStatus.FAILED, EventStatus.FAILED
    if r < 0.97:
        return NotificationStatus.PROCESSING, EventStatus.PROCESSING
    return NotificationStatus.PENDING, EventStatus.ACCEPTED


async def _ensure_api_key(db: AsyncSession) -> ApiKey:
    """Create the Ensomble API key if it doesn't exist."""
    key_hash = hash_api_key(RAW_KEY)
    result = await db.execute(select(ApiKey).where(col(ApiKey.key_hash) == key_hash))
    existing = result.scalar_one_or_none()
    if existing:
        print(f"  ✓ Ensomble API key exists (prefix: {existing.key_prefix}…)")
        return existing

    api_key = ApiKey(
        key_hash=key_hash,
        key_prefix=RAW_KEY[:10],
        name=KEY_NAME,
        description="Ensomble marketplace — demo integration key",
    )
    db.add(api_key)
    await db.flush()
    print(f"  ✓ Created Ensomble API key (prefix: {api_key.key_prefix}…)")
    return api_key


async def _clear_key_data(db: AsyncSession, api_key_id: uuid.UUID) -> None:
    """Remove all data for this specific API key only."""
    from sqlalchemy import text as sa_text

    # Notification logs for notifications of events owned by this key
    await db.execute(
        sa_text("""
        DELETE FROM notification_logs WHERE notification_id IN (
            SELECT n.id FROM notifications n
            JOIN events e ON n.event_id = e.id
            WHERE e.api_key_id = :kid
        )
    """),
        {"kid": str(api_key_id)},
    )

    await db.execute(
        sa_text("""
        DELETE FROM dead_letter_messages WHERE notification_id IN (
            SELECT n.id FROM notifications n
            JOIN events e ON n.event_id = e.id
            WHERE e.api_key_id = :kid
        )
    """),
        {"kid": str(api_key_id)},
    )

    await db.execute(
        sa_text(
            "DELETE FROM notifications WHERE event_id IN "
            "(SELECT id FROM events WHERE api_key_id = :kid)"
        ),
        {"kid": str(api_key_id)},
    )

    await db.execute(
        sa_text("DELETE FROM events WHERE api_key_id = :kid"), {"kid": str(api_key_id)}
    )

    await db.execute(
        sa_text("DELETE FROM audit_logs WHERE api_key_id = :kid"), {"kid": str(api_key_id)}
    )

    await db.execute(
        sa_text("DELETE FROM api_key_usage WHERE api_key_id = :kid"), {"kid": str(api_key_id)}
    )

    print("  ✗ Cleared existing Ensomble data")


async def seed_ensomble_events(db: AsyncSession, api_key: ApiKey) -> None:
    """Create 120 realistic Ensomble events across 30 days."""
    now = utc_now()
    rng = random.Random(2026)
    total_events = 120
    all_notifications: list[Notification] = []

    # Weight event types: bookings and messages are most common
    weighted_types = (
        EVENT_TYPES[:3] * 3  # customer events ×3
        + EVENT_TYPES[3:8] * 2  # musician events ×2
        + EVENT_TYPES[8:13] * 5  # booking events ×5 (most common)
        + EVENT_TYPES[13:17] * 3  # payment events ×3
        + ["message.received"] * 8  # messages very common
        + EVENT_TYPES[19:21] * 2  # reviews ×2
        + EVENT_TYPES[21:23]  # disputes rare
    )

    for i in range(total_events):
        days_ago = rng.expovariate(0.18)
        days_ago = min(days_ago, 30)
        hours_offset = rng.uniform(0, 24)
        event_time = now - timedelta(days=days_ago, hours=hours_offset)

        event_type = rng.choice(weighted_types)
        priority = PRIORITY_MAP.get(event_type, EventPriority.MEDIUM)
        channel = CHANNEL_MAP.get(event_type, NotificationChannel.EMAIL)
        address = rng.choice(ADDRESSES[channel])
        age_hours = (now - event_time).total_seconds() / 3600
        notif_status, event_status = _pick_outcome(rng, age_hours)

        event = Event(
            event_type=event_type,
            priority=priority,
            status=event_status,
            payload=_make_payload(rng, event_type, i),
            api_key_id=api_key.id,
            recipient_count=1,
            created_at=event_time,
            updated_at=event_time,
        )
        db.add(event)
        await db.flush()

        latency_ms = rng.uniform(60, 3800) if notif_status == NotificationStatus.DELIVERED else None
        delivered_at = event_time + timedelta(milliseconds=latency_ms) if latency_ms else None
        failed_at = (
            event_time + timedelta(seconds=rng.uniform(1, 25))
            if notif_status == NotificationStatus.FAILED
            else None
        )
        queued_at = event_time + timedelta(milliseconds=rng.uniform(5, 40))
        processing_at = (
            queued_at + timedelta(milliseconds=rng.uniform(10, 150))
            if notif_status != NotificationStatus.PENDING
            else None
        )

        notif = Notification(
            event_id=event.id,
            channel=channel,
            status=notif_status,
            priority=priority,
            recipient_user_id=address,
            recipient_address=address,
            retry_count=(rng.randint(1, 3) if notif_status == NotificationStatus.FAILED else 0),
            created_at=event_time,
            queued_at=queued_at,
            processing_started_at=processing_at,
            delivered_at=delivered_at,
            failed_at=failed_at,
            error_message=(
                rng.choice(
                    [
                        "SMTP connection timeout",
                        "Recipient mailbox full",
                        "Webhook endpoint 503",
                        "Rate limit exceeded",
                        "DNS resolution failed",
                    ]
                )
                if notif_status == NotificationStatus.FAILED
                else None
            ),
            updated_at=(delivered_at or failed_at or processing_at or queued_at or event_time),
        )
        db.add(notif)
        all_notifications.append(notif)

    await db.flush()
    print(f"  ✓ Created {total_events} Ensomble events with notifications")
    return all_notifications


async def seed_notification_logs(db: AsyncSession, notifications: list[Notification]) -> None:
    """Create delivery timeline logs for each notification."""
    count = 0
    for n in notifications:
        db.add(
            NotificationLog(
                notification_id=n.id,
                previous_status=None,
                new_status="pending",
                message="Notification accepted",
                created_at=n.created_at,
            )
        )
        count += 1

        if n.queued_at:
            db.add(
                NotificationLog(
                    notification_id=n.id,
                    previous_status="pending",
                    new_status="queued",
                    message="Queued for delivery",
                    created_at=n.queued_at,
                )
            )
            count += 1

        if n.processing_started_at:
            db.add(
                NotificationLog(
                    notification_id=n.id,
                    previous_status="queued",
                    new_status="processing",
                    worker_id="worker-ensomble@dispatcher",
                    message="Picked up by worker",
                    created_at=n.processing_started_at,
                )
            )
            count += 1

        if n.delivered_at:
            db.add(
                NotificationLog(
                    notification_id=n.id,
                    previous_status="processing",
                    new_status="delivered",
                    worker_id="worker-ensomble@dispatcher",
                    message="Delivered successfully",
                    provider_response={"status": "ok"},
                    created_at=n.delivered_at,
                )
            )
            count += 1
        elif n.failed_at:
            db.add(
                NotificationLog(
                    notification_id=n.id,
                    previous_status="processing",
                    new_status="failed",
                    worker_id="worker-ensomble@dispatcher",
                    message=n.error_message or "Delivery failed",
                    error_type="DeliveryError",
                    error_message=n.error_message,
                    created_at=n.failed_at,
                )
            )
            count += 1

    await db.flush()
    print(f"  ✓ Created {count} notification log entries")


async def seed_dlq(db: AsyncSession, notifications: list[Notification]) -> None:
    """Create DLQ entries from failed notifications."""
    rng = random.Random(99)
    failed = [n for n in notifications if n.status == NotificationStatus.FAILED]
    count = 0

    for n in failed:
        evt_result = await db.execute(select(Event).where(col(Event.id) == n.event_id))
        evt = evt_result.scalar_one_or_none()

        status = rng.choice(
            [
                DeadLetterStatus.ACTIVE,
                DeadLetterStatus.ACTIVE,
                DeadLetterStatus.ACTIVE,
                DeadLetterStatus.RETRIED,
                DeadLetterStatus.DISCARDED,
            ]
        )

        base_time = n.failed_at or n.created_at
        dlq = DeadLetterMessage(
            notification_id=n.id,
            channel=n.channel,
            recipient_address=n.recipient_address,
            event_payload=evt.payload if evt else {},
            error_type="DeliveryError",
            error_message=n.error_message or "Connection timeout",
            retry_count=n.retry_count,
            retry_history=[
                {
                    "attempt": i + 1,
                    "error": n.error_message or "timeout",
                    "timestamp": str(n.created_at + timedelta(minutes=i * 5)),
                }
                for i in range(n.retry_count)
            ],
            status=status,
            failed_at=base_time,
            retried_at=(
                base_time + timedelta(hours=1) if status == DeadLetterStatus.RETRIED else None
            ),
            discarded_at=(
                base_time + timedelta(hours=2) if status == DeadLetterStatus.DISCARDED else None
            ),
            created_at=base_time,
        )
        db.add(dlq)
        count += 1

    await db.flush()
    print(f"  ✓ Created {count} DLQ entries")


async def seed_audit_logs(db: AsyncSession, api_key: ApiKey) -> None:
    """Create audit log entries for Ensomble key."""
    rng = random.Random(42)
    now = utc_now()

    actions = [
        ("event.created", "event"),
        ("event.completed", "event"),
        ("booking.confirmed", "booking"),
        ("booking.cancelled", "booking"),
        ("notification.sent", "notification"),
        ("notification.delivered", "notification"),
        ("notification.failed", "notification"),
        ("payment.processed", "payment"),
        ("musician.approved", "musician"),
        ("config.updated", "channel_config"),
        ("template.created", "template"),
        ("api_key.rotated", "api_key"),
    ]
    ips = ["51.105.12.34", "20.68.45.67", "104.21.89.12"]

    count = 0
    for i in range(80):
        days_ago = min(rng.expovariate(0.2), 30)
        log_time = now - timedelta(days=days_ago, hours=rng.uniform(0, 24))
        action, resource_type = rng.choice(actions)

        # Build meaningful metadata per action type
        if "booking" in action:
            meta = {
                "booking_id": f"BK-{rng.randint(1000, 9999)}",
                "musician": rng.choice(MUSICIAN_NAMES),
                "venue": rng.choice(BOOKING_VENUES),
            }
        elif "payment" in action:
            meta = {
                "amount_gbp": rng.choice([250, 500, 750, 1200]),
                "payment_id": f"pi_{rng.randint(10000, 99999)}",
            }
        elif "musician" in action:
            meta = {
                "stage_name": rng.choice(MUSICIAN_NAMES),
                "status": rng.choice(["approved", "rejected", "pending"]),
            }
        elif "notification" in action:
            meta = {
                "channel": rng.choice(["email", "sms", "webhook"]),
                "recipient": rng.choice(CUSTOMERS),
            }
        elif "template" in action:
            meta = {
                "template_name": rng.choice(
                    ["booking_confirmation", "welcome_musician", "payment_receipt"]
                )
            }
        elif "config" in action:
            meta = {
                "channel": rng.choice(["email", "webhook"]),
                "field": rng.choice(["rate_limit", "retry_policy"]),
            }
        elif "api_key" in action:
            meta = {"reason": rng.choice(["scheduled_rotation", "security_audit"])}
        elif "event" in action:
            meta = {
                "event_type": rng.choice(
                    ["booking.requested", "payment.received", "message.received"]
                )
            }
        else:
            meta = {"source": "ensomble"}

        db.add(
            AuditLog(
                api_key_id=api_key.id,
                action=action,
                resource_type=resource_type,
                resource_id=str(rng.randint(1000, 9999)),
                metadata_=meta,
                ip_address=rng.choice(ips),
                created_at=log_time,
            )
        )
        count += 1

    await db.flush()
    print(f"  ✓ Created {count} audit log entries")


async def seed_usage(db: AsyncSession, api_key: ApiKey) -> None:
    """Create hourly usage buckets for Ensomble key."""
    rng = random.Random(33)
    now = utc_now()

    endpoints = [
        ("/api/v1/events", "POST", 201),
        ("/api/v1/events", "POST", 400),
        ("/api/v1/events", "GET", 200),
        ("/api/v1/notifications", "GET", 200),
        ("/api/v1/events/batch", "POST", 201),
    ]

    count = 0
    for days_ago in range(30, -1, -1):
        if days_ago <= 1:
            active_hours = rng.sample(range(8, 23), k=rng.randint(10, 14))
        elif days_ago <= 7:
            active_hours = rng.sample(range(7, 23), k=rng.randint(6, 12))
        else:
            active_hours = rng.sample(range(9, 22), k=rng.randint(2, 6))

        for hour in active_hours:
            bucket = datetime(
                now.year,
                now.month,
                now.day,
                hour,
                0,
                0,
            ) - timedelta(days=days_ago)

            chosen = rng.sample(endpoints, k=min(rng.randint(1, 3), len(endpoints)))
            for endpoint, method, status_code in chosen:
                req_count = rng.randint(3, 40) if status_code < 400 else rng.randint(1, 4)
                db.add(
                    ApiKeyUsage(
                        api_key_id=api_key.id,
                        endpoint=endpoint,
                        method=method,
                        status_code=status_code,
                        hour_bucket=bucket,
                        request_count=req_count,
                    )
                )
                count += 1

    await db.flush()
    print(f"  ✓ Created {count} usage buckets")


async def main() -> None:
    print("\n🎵 Seeding Ensomble demo data…\n")

    async with async_session() as db:
        print("[API Key]")
        api_key = await _ensure_api_key(db)

        print("\n[Clear Old Data]")
        await _clear_key_data(db, api_key.id)

        print("\n[Events & Notifications]")
        notifications = await seed_ensomble_events(db, api_key)

        print("\n[Notification Logs]")
        await seed_notification_logs(db, notifications)

        print("\n[Dead Letter Queue]")
        await seed_dlq(db, notifications)

        print("\n[Audit Logs]")
        await seed_audit_logs(db, api_key)

        print("\n[API Usage]")
        await seed_usage(db, api_key)

        await db.commit()

    await engine.dispose()
    print("\n✅ Ensomble seed complete!\n")


if __name__ == "__main__":
    asyncio.run(main())
