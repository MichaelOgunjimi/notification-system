"""Unit tests for event_service — recipient address resolution and create_event."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.enums import EventPriority, NotificationChannel
from app.schemas.events import EventCreate, RecipientCreate
from app.services.event_service import _resolve_recipient_address

# ---------------------------------------------------------------------------
# _resolve_recipient_address
# ---------------------------------------------------------------------------


class TestResolveRecipientAddress:
    def _recipient(self, **kwargs) -> RecipientCreate:
        defaults = {
            "channels": [NotificationChannel.EMAIL],
            "email": None,
            "phone": None,
            "webhook_url": None,
        }
        defaults.update(kwargs)
        return RecipientCreate(**defaults)

    def test_returns_email(self) -> None:
        r = self._recipient(email="alice@example.com", channels=[NotificationChannel.EMAIL])
        assert _resolve_recipient_address(r, "email") == "alice@example.com"

    def test_returns_phone(self) -> None:
        r = self._recipient(phone="+15551234567", channels=[NotificationChannel.SMS])
        assert _resolve_recipient_address(r, "sms") == "+15551234567"

    def test_returns_webhook_url(self) -> None:
        r = self._recipient(
            webhook_url="https://example.com/hook", channels=[NotificationChannel.WEBHOOK]
        )
        assert _resolve_recipient_address(r, "webhook") == "https://example.com/hook"

    def test_missing_email_raises(self) -> None:
        r = self._recipient(channels=[NotificationChannel.EMAIL])
        with pytest.raises(ValueError, match="missing 'email'"):
            _resolve_recipient_address(r, "email")

    def test_missing_phone_raises(self) -> None:
        r = self._recipient(channels=[NotificationChannel.SMS])
        with pytest.raises(ValueError, match="missing 'phone'"):
            _resolve_recipient_address(r, "sms")

    def test_missing_webhook_url_raises(self) -> None:
        r = self._recipient(channels=[NotificationChannel.WEBHOOK])
        with pytest.raises(ValueError, match="missing 'webhook_url'"):
            _resolve_recipient_address(r, "webhook")

    def test_unsupported_channel_raises(self) -> None:
        r = self._recipient()
        with pytest.raises(ValueError, match="Unsupported channel"):
            _resolve_recipient_address(r, "fax")

    def test_error_message_includes_user_id(self) -> None:
        r = self._recipient(user_id="user-42", channels=[NotificationChannel.EMAIL])
        with pytest.raises(ValueError, match="user-42"):
            _resolve_recipient_address(r, "email")

    def test_error_message_uses_unknown_fallback(self) -> None:
        r = self._recipient(channels=[NotificationChannel.EMAIL])
        with pytest.raises(ValueError, match="unknown"):
            _resolve_recipient_address(r, "email")


# ---------------------------------------------------------------------------
# create_event — integration with DB mocked
# ---------------------------------------------------------------------------


def _make_event_data(**kwargs) -> EventCreate:
    defaults = {
        "event_type": "user.signup",
        "recipients": [
            RecipientCreate(
                channels=[NotificationChannel.EMAIL],
                email="test@example.com",
            )
        ],
        "priority": EventPriority.MEDIUM,
    }
    defaults.update(kwargs)
    return EventCreate(**defaults)


@pytest.mark.asyncio
async def test_create_event_returns_is_duplicate_false_for_new_event() -> None:
    from app.services import event_service

    # build an async context manager for db.begin_nested()
    nested_ctx = AsyncMock()
    nested_ctx.__aenter__ = AsyncMock(return_value=None)
    nested_ctx.__aexit__ = AsyncMock(return_value=False)

    mock_db = MagicMock()  # MagicMock so .add() is sync (no coroutine warnings)
    mock_db.begin_nested = MagicMock(return_value=nested_ctx)
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    fake_id = uuid.uuid4()

    async def _refresh(obj):
        obj.id = fake_id

    mock_db.refresh = _refresh

    with (
        patch("app.services.event_service.idempotency_service.check", return_value=None),
        patch(
            "app.services.event_service.get_event_notification_ids",
            return_value=[uuid.uuid4()],
        ),
    ):
        data = _make_event_data()
        api_key_id = uuid.uuid4()
        event, notification_ids, is_duplicate = await event_service.create_event(
            mock_db, data, api_key_id
        )

    assert is_duplicate is False
    assert mock_db.commit.called


@pytest.mark.asyncio
async def test_create_event_returns_is_duplicate_true_for_existing_idempotency_key() -> None:
    from app.services import event_service

    mock_db = AsyncMock()
    existing_event = MagicMock()
    existing_event.id = uuid.uuid4()
    existing_ids = [uuid.uuid4(), uuid.uuid4()]

    with (
        patch(
            "app.services.event_service.idempotency_service.check",
            return_value=existing_event,
        ),
        patch(
            "app.services.event_service.get_event_notification_ids",
            return_value=existing_ids,
        ),
    ):
        data = _make_event_data(idempotency_key="my-key")
        event, notification_ids, is_duplicate = await event_service.create_event(
            mock_db, data, uuid.uuid4()
        )

    assert is_duplicate is True
    assert event is existing_event
    assert notification_ids == existing_ids
    mock_db.commit.assert_not_called()
