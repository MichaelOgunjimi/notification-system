"""Tests for the worker channel_base pipeline.

Uses a real PostgreSQL sync session (test DB) to verify:
- SELECT FOR UPDATE prevents double-delivery
- Template errors → FAILED, not stuck PROCESSING
- Unexpected errors after PROCESSING commit → FAILED recovery
- Successful and failed delivery flows
- _maybe_complete_event logic
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from pydantic import PostgresDsn
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

import app.model_registry  # noqa: F401
from app.core.config import settings
from app.core.datetime import utc_now
from app.modules.credentials.model import ApiKey
from app.modules.delivery.adapters.base import DeliveryResult
from app.modules.delivery.processing.channel import _maybe_complete_event, process_notification
from app.modules.events.enums import EventStatus
from app.modules.events.model import Event
from app.modules.notifications.enums import NotificationStatus
from app.modules.notifications.log_model import NotificationLog
from app.modules.notifications.model import Notification
from app.modules.templates.model import Template
from tests.helpers import create_sync_project_api_key

SYNC_TEST_DB_URL = str(
    PostgresDsn.build(
        scheme="postgresql+psycopg2",
        username=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        host=settings.POSTGRES_SERVER,
        port=settings.POSTGRES_PORT,
        path=f"{settings.POSTGRES_DB}_test",
    )
)

sync_test_engine = create_engine(SYNC_TEST_DB_URL, poolclass=NullPool)
SyncTestSession = sessionmaker(bind=sync_test_engine, class_=Session, expire_on_commit=False)


@pytest.fixture(autouse=True)
def _clean_sync_tables():
    yield
    with sync_test_engine.connect() as conn:
        conn.execute(
            text(
                "TRUNCATE api_key_usage, audit_logs, alert_rules, suppressions, "
                "notification_logs, dead_letter_messages, notifications, "
                "events, templates, channel_configs, retry_policies, api_keys CASCADE"
            )
        )
        conn.commit()


def _get_test_session() -> Session:
    return SyncTestSession()


def _seed_event_and_notification(
    session: Session,
    status: NotificationStatus = NotificationStatus.QUEUED,
    channel: str = "email",
) -> tuple[Event, Notification]:
    """Insert a minimal api_key + event + notification into the test DB."""
    api_key = create_sync_project_api_key(session, name="worker-test-key")

    event = Event(
        id=uuid.uuid4(),
        event_type="test.event",
        payload={"msg": "hello"},
        status=EventStatus.PROCESSING,
        api_key_id=api_key.id,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(event)
    session.flush()

    notification = Notification(
        id=uuid.uuid4(),
        event_id=event.id,
        channel=channel,
        recipient_user_id="test-user-1",
        recipient_address="user@test.com",
        status=status,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(notification)
    session.commit()
    return event, notification


class TestProcessNotification:
    """Tests for process_notification()."""

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_successful_delivery(self, mock_get_adapter, mock_get_session):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=True, provider_response={"status": "ok"}
        )
        mock_get_adapter.return_value = mock_adapter

        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(notification.id), "email")

        assert result["status"] == "delivered"
        assert result["notification_id"] == str(notification.id)

        verify_session = _get_test_session()
        n = verify_session.get(Notification, notification.id)
        assert n.status == NotificationStatus.DELIVERED
        assert n.delivered_at is not None
        verify_session.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_failed_delivery(self, mock_get_adapter, mock_get_session):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(
            success=False, error_message="Provider error"
        )
        mock_get_adapter.return_value = mock_adapter

        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(notification.id), "email")

        assert result["status"] == "failed"

        verify_session = _get_test_session()
        n = verify_session.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        assert "Provider error" in n.error_message
        verify_session.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_already_processed_skipped(self, mock_get_adapter, mock_get_session):
        """Notification already DELIVERED should be skipped (idempotency)."""
        session = _get_test_session()
        _event, notification = _seed_event_and_notification(
            session, status=NotificationStatus.DELIVERED
        )
        session.close()

        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(notification.id), "email")

        assert result["status"] == "skipped"
        mock_get_adapter.assert_not_called()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    def test_notification_not_found(self, mock_get_session):
        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(uuid.uuid4()), "email")
        assert result["status"] == "error"
        assert result["reason"] == "notification_not_found"

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_template_error_marks_failed(self, mock_get_adapter, mock_get_session):
        """Template rendering error → FAILED, not stuck in PROCESSING."""
        session = _get_test_session()
        _event, notification = _seed_event_and_notification(session)
        session.close()

        mock_get_session.return_value = _get_test_session()

        with patch(
            "app.modules.delivery.processing.channel._render_body",
            side_effect=Exception("Jinja2 UndefinedError: 'name' is undefined"),
        ):
            result = process_notification(str(notification.id), "email")

        assert result["status"] == "failed"
        assert "template_error" in result["reason"]

        verify_session = _get_test_session()
        n = verify_session.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        assert "Template error" in n.error_message
        verify_session.close()

        mock_get_adapter.assert_not_called()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_missing_template_variable_fails_without_retry(
        self, mock_get_adapter, mock_get_session
    ):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        api_key = session.get(ApiKey, event.api_key_id)
        template = Template(
            project_id=api_key.project_id,
            name="strict-email",
            channel="email",
            subject="Hi {{ customer_name }}",
            body="<p>Order {{ order_number }}</p>",
            variables=["customer_name", "order_number"],
            on_missing_variable="error",
        )
        session.add(template)
        session.flush()
        event.template_id = template.id
        session.commit()
        session.close()

        mock_get_session.return_value = _get_test_session()
        result = process_notification(str(notification.id), "email", celery_task=MagicMock())

        assert result["status"] == "failed"
        assert "customer_name" in result["reason"]
        assert "order_number" in result["reason"]
        mock_get_adapter.assert_not_called()
        verify_session = _get_test_session()
        saved = verify_session.get(Notification, notification.id)
        assert saved.retry_count == 0
        verify_session.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_inline_email_bypasses_jinja_and_passes_plain_text(
        self, mock_get_adapter, mock_get_session
    ):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        event.inline_content = {
            "subject": "O'Brien & <ready>",
            "html": "<h1>{{ untouched }}</h1><p>Ready &amp; waiting</p>",
            "text": None,
        }
        session.commit()
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(success=True)
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        result = process_notification(str(notification.id), "email")

        assert result["status"] == "delivered"
        call = mock_adapter.send.call_args.kwargs
        assert call["subject"] == "O'Brien & <ready>"
        assert call["body"] == "<h1>{{ untouched }}</h1><p>Ready &amp; waiting</p>"
        assert call["plain_text"] == "{{ untouched }}\nReady & waiting"

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_inline_email_passes_sender_fields_to_adapter(self, mock_get_adapter, mock_get_session):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        event.inline_content = {
            "subject": "Order confirmed",
            "html": "<p>Thanks</p>",
            "text": None,
            "from_local": "orders",
            "from_name": "Winwell Orders",
            "reply_to": "support@winwell.example",
        }
        session.commit()
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(success=True)
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        assert process_notification(str(notification.id), "email")["status"] == "delivered"
        call = mock_adapter.send.call_args.kwargs
        assert call["from_local"] == "orders"
        assert call["from_name"] == "Winwell Orders"
        assert call["reply_to"] == "support@winwell.example"

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_legacy_inline_email_without_sender_fields_uses_defaults(
        self, mock_get_adapter, mock_get_session
    ):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        event.inline_content = {"subject": "Hi", "html": "<p>Hi</p>", "text": None}
        session.commit()
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(success=True)
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        assert process_notification(str(notification.id), "email")["status"] == "delivered"
        call = mock_adapter.send.call_args.kwargs
        assert call["from_local"] is None
        assert call["from_name"] is None
        assert call["reply_to"] is None

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_template_sender_fields_reach_adapter(self, mock_get_adapter, mock_get_session):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session)
        api_key = session.get(ApiKey, event.api_key_id)
        template = Template(
            project_id=api_key.project_id,
            name="order-confirmed",
            channel="email",
            subject="Order",
            body="<p>Thanks</p>",
            from_local="billing",
            from_name="Acme Billing",
            reply_to="help@acme.example",
        )
        session.add(template)
        session.flush()
        event.template_id = template.id
        session.commit()
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(success=True)
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        assert process_notification(str(notification.id), "email")["status"] == "delivered"
        call = mock_adapter.send.call_args.kwargs
        assert call["from_local"] == "billing"
        assert call["from_name"] == "Acme Billing"
        assert call["reply_to"] == "help@acme.example"

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_non_email_channels_get_no_sender_fields(self, mock_get_adapter, mock_get_session):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session, channel="sms")
        event.inline_content = {"html": "<p>x</p>", "from_local": "orders"}
        session.commit()
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(success=True)
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        process_notification(str(notification.id), "sms")
        assert "from_local" not in mock_adapter.send.call_args.kwargs

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_inline_email_is_not_used_for_other_channels(self, mock_get_adapter, mock_get_session):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(session, channel="sms")
        event.inline_content = {"subject": "Email", "html": "<p>Email only</p>", "text": None}
        session.commit()
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(success=True)
        mock_get_adapter.return_value = mock_adapter
        mock_get_session.return_value = _get_test_session()

        assert process_notification(str(notification.id), "sms")["status"] == "delivered"
        call = mock_adapter.send.call_args.kwargs
        assert call["subject"] is None
        assert call["body"] == '{"msg": "hello"}'

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_unexpected_error_recovers_from_processing(self, mock_get_adapter, mock_get_session):
        """If adapter.send() raises, notification moves to FAILED not zombie PROCESSING."""
        session = _get_test_session()
        _event, notification = _seed_event_and_notification(session)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.side_effect = RuntimeError("Connection exploded")
        mock_get_adapter.return_value = mock_adapter

        mock_get_session.return_value = _get_test_session()

        with pytest.raises(RuntimeError, match="Connection exploded"):
            process_notification(str(notification.id), "email")

        verify_session = _get_test_session()
        n = verify_session.get(Notification, notification.id)
        assert n.status == NotificationStatus.FAILED
        assert n.error_message == "Unexpected worker error"
        verify_session.close()

    @patch("app.modules.delivery.processing.channel.get_sync_session")
    @patch("app.modules.delivery.processing.channel.get_adapter")
    def test_logs_created_for_transitions(self, mock_get_adapter, mock_get_session):
        """Verify NotificationLog entries are created for each status transition."""
        session = _get_test_session()
        _event, notification = _seed_event_and_notification(session)
        session.close()

        mock_adapter = MagicMock()
        mock_adapter.send.return_value = DeliveryResult(success=True)
        mock_get_adapter.return_value = mock_adapter

        mock_get_session.return_value = _get_test_session()
        process_notification(str(notification.id), "email")

        verify_session = _get_test_session()
        logs = (
            verify_session.execute(
                select(NotificationLog)
                .where(NotificationLog.notification_id == notification.id)
                .order_by(NotificationLog.created_at)
            )
            .scalars()
            .all()
        )
        assert len(logs) == 2
        assert logs[0].new_status == NotificationStatus.PROCESSING
        assert logs[1].new_status == NotificationStatus.DELIVERED
        verify_session.close()


class TestMaybeCompleteEvent:
    """Tests for _maybe_complete_event()."""

    def test_all_delivered_marks_completed(self):
        session = _get_test_session()
        event, notification = _seed_event_and_notification(
            session, status=NotificationStatus.DELIVERED
        )

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.COMPLETED
        session.close()

    def test_mixed_results_marks_partially_failed(self):
        session = _get_test_session()
        api_key = create_sync_project_api_key(session, name="worker-test-key")

        event = Event(
            id=uuid.uuid4(),
            event_type="test.event",
            payload={},
            status=EventStatus.PROCESSING,
            api_key_id=api_key.id,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(event)
        session.flush()

        n1 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="email",
            recipient_user_id="test-user-1",
            recipient_address="a@test.com",
            status=NotificationStatus.DELIVERED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        n2 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="sms",
            recipient_user_id="test-user-1",
            recipient_address="+15551234567",
            status=NotificationStatus.FAILED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add_all([n1, n2])
        session.commit()

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.PARTIALLY_FAILED
        session.close()

    def test_inflight_notification_keeps_processing(self):
        """If one notification is still QUEUED, event stays PROCESSING."""
        session = _get_test_session()
        api_key = create_sync_project_api_key(session, name="worker-test-key")

        event = Event(
            id=uuid.uuid4(),
            event_type="test.event",
            payload={},
            status=EventStatus.PROCESSING,
            api_key_id=api_key.id,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(event)
        session.flush()

        n1 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="email",
            recipient_user_id="test-user-1",
            recipient_address="a@test.com",
            status=NotificationStatus.DELIVERED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        n2 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="sms",
            recipient_user_id="test-user-1",
            recipient_address="+15551234567",
            status=NotificationStatus.QUEUED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add_all([n1, n2])
        session.commit()

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.PROCESSING
        session.close()

    def test_all_cancelled_marks_event_cancelled(self):
        """All notifications CANCELLED → event status becomes CANCELLED, not COMPLETED."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(
            session, status=NotificationStatus.CANCELLED
        )

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.CANCELLED
        session.close()

    def test_mixed_cancelled_and_delivered_marks_completed(self):
        """Cancelled + delivered → COMPLETED (cancelled ones were intentionally skipped)."""
        session = _get_test_session()
        api_key = create_sync_project_api_key(session, name="worker-test-key")

        event = Event(
            id=uuid.uuid4(),
            event_type="test.event",
            payload={},
            status=EventStatus.PROCESSING,
            api_key_id=api_key.id,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(event)
        session.flush()

        n1 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="email",
            recipient_user_id="test-user-1",
            recipient_address="a@test.com",
            status=NotificationStatus.DELIVERED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        n2 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="sms",
            recipient_user_id="test-user-1",
            recipient_address="+15551234567",
            status=NotificationStatus.CANCELLED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add_all([n1, n2])
        session.commit()

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.COMPLETED
        session.close()

    def test_all_failed_marks_event_failed(self):
        """All notifications FAILED → event status becomes FAILED."""
        session = _get_test_session()
        event, notification = _seed_event_and_notification(
            session, status=NotificationStatus.FAILED
        )

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.FAILED
        session.close()

    def test_cancelled_and_failed_marks_partially_failed(self):
        """CANCELLED + FAILED (no DELIVERED) → PARTIALLY_FAILED.

        CANCELLED means intentionally skipped, so the event isn't a total
        failure — some notifications were never attempted. PARTIALLY_FAILED
        correctly signals that delivery was attempted and failed for the
        non-cancelled subset.
        """
        session = _get_test_session()
        api_key = create_sync_project_api_key(session, name="worker-test-key")

        event = Event(
            id=uuid.uuid4(),
            event_type="test.event",
            payload={},
            status=EventStatus.PROCESSING,
            api_key_id=api_key.id,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(event)
        session.flush()

        n1 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="email",
            recipient_user_id="test-user-1",
            recipient_address="a@test.com",
            status=NotificationStatus.CANCELLED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        n2 = Notification(
            id=uuid.uuid4(),
            event_id=event.id,
            channel="sms",
            recipient_user_id="test-user-1",
            recipient_address="+15551234567",
            status=NotificationStatus.FAILED,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add_all([n1, n2])
        session.commit()

        _maybe_complete_event(session, event.id)

        event_refreshed = session.get(Event, event.id)
        assert event_refreshed.status == EventStatus.PARTIALLY_FAILED
        session.close()
