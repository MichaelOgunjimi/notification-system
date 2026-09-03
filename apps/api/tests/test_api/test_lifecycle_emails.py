"""Lifecycle notification emails: rendering and best-effort dispatch."""

import json
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime import utc_now
from app.modules.delivery.adapters.base import DeliveryResult
from app.modules.delivery.notifications import send_notification_email
from app.modules.delivery.templates.transactional import (
    email_changed_email,
    invitation_accepted_email,
    member_removed_email,
    member_role_changed_email,
    welcome_email,
)
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User

FRONTEND = "https://app.example.com"


async def _verified_user(db: AsyncSession, email: str, name: str = "Person") -> User:
    user = User(email=email, name=name)
    db.add(user)
    await db.flush()
    db.add(EmailAddress(user_id=user.id, email=email, is_primary=True, verified_at=utc_now()))
    await db.commit()
    return user


def test_welcome_email_renders_with_a_workspace_call_to_action() -> None:
    message = welcome_email(
        frontend_url=FRONTEND,
        recipient="new@example.com",
        recipient_name="New Person",
        workspace_name="Northwind Workspace",
    )
    assert message.subject
    assert "Northwind Workspace" in message.html
    assert "Northwind Workspace" in message.text
    assert f"{FRONTEND}/workspace" in message.html
    assert f"{FRONTEND}/workspace" in message.text


def test_email_changed_email_names_the_new_address() -> None:
    message = email_changed_email(
        frontend_url=FRONTEND,
        recipient="old@example.com",
        recipient_name="Person",
        new_email="new@example.com",
    )
    assert "new@example.com" in message.html
    assert "new@example.com" in message.text
    # The security fallback link points somewhere the recipient can still reach.
    assert f"{FRONTEND}/login" in message.html


def test_member_removed_email_names_the_organization() -> None:
    message = member_removed_email(
        frontend_url=FRONTEND,
        recipient="member@example.com",
        recipient_name="Member",
        organization_name="Acme",
    )
    assert "Acme" in message.html
    assert "Acme" in message.text


def test_member_role_changed_email_names_the_new_role() -> None:
    message = member_role_changed_email(
        frontend_url=FRONTEND,
        recipient="member@example.com",
        recipient_name="Member",
        organization_name="Acme",
        role="admin",
    )
    assert "Acme" in message.html
    assert "Admin" in message.html or "admin" in message.html


def test_invitation_accepted_email_names_the_new_member() -> None:
    message = invitation_accepted_email(
        frontend_url=FRONTEND,
        recipient="inviter@example.com",
        recipient_name="Inviter",
        organization_name="Acme",
        member_email="joiner@example.com",
        role="member",
    )
    assert "joiner@example.com" in message.html
    assert "Acme" in message.html


async def test_send_notification_email_returns_true_on_success() -> None:
    message = member_removed_email(
        frontend_url=FRONTEND,
        recipient="member@example.com",
        recipient_name="Member",
        organization_name="Acme",
    )
    with patch(
        "app.modules.delivery.notifications.EmailAdapter.send",
        return_value=DeliveryResult(success=True),
    ):
        assert await send_notification_email("member@example.com", message) is True


async def test_send_notification_email_swallows_a_provider_failure() -> None:
    message = member_removed_email(
        frontend_url=FRONTEND,
        recipient="member@example.com",
        recipient_name="Member",
        organization_name="Acme",
    )
    with patch(
        "app.modules.delivery.notifications.EmailAdapter.send",
        return_value=DeliveryResult(success=False, error_message="smtp down"),
    ):
        assert await send_notification_email("member@example.com", message) is False


async def test_send_notification_email_swallows_an_unexpected_error() -> None:
    message = welcome_email(
        frontend_url=FRONTEND,
        recipient="new@example.com",
        recipient_name="New",
        workspace_name="New's Workspace",
    )
    with patch(
        "app.modules.delivery.notifications.EmailAdapter.send",
        side_effect=RuntimeError("boom"),
    ):
        assert await send_notification_email("new@example.com", message) is False


async def test_first_magic_link_sign_in_sends_a_welcome_email(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock
) -> None:
    mock_redis.getdel.return_value = json.dumps({"email": "fresh@example.com"})

    with patch(
        "app.modules.identity.service.send_notification_email", new_callable=AsyncMock
    ) as notify:
        response = await client.post(
            "/api/v1/auth/magic-link/verify", json={"token": "welcome-token"}
        )

    assert response.status_code == 200
    notify.assert_awaited_once()
    recipient, message = notify.await_args.args
    assert recipient == "fresh@example.com"
    assert message.subject == "Welcome to Beaco"


async def test_returning_magic_link_sign_in_sends_no_welcome_email(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock
) -> None:
    await _verified_user(db, "returning@example.com")
    mock_redis.getdel.return_value = json.dumps({"email": "returning@example.com"})

    with patch(
        "app.modules.identity.service.send_notification_email", new_callable=AsyncMock
    ) as notify:
        response = await client.post(
            "/api/v1/auth/magic-link/verify", json={"token": "return-token"}
        )

    assert response.status_code == 200
    notify.assert_not_awaited()


async def _auth(user: User, db: AsyncSession, redis) -> dict[str, str]:
    from app.modules.identity.service import create_user_tokens

    tokens = await create_user_tokens(user, db, redis)
    return {"Authorization": f"Bearer {tokens.access_token}"}


async def test_promoting_a_verified_address_notifies_the_previous_primary(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock
) -> None:
    user = await _verified_user(db, "old-primary@example.com")
    secondary = EmailAddress(
        user_id=user.id, email="new-primary@example.com", verified_at=utc_now()
    )
    db.add(secondary)
    await db.commit()
    await db.refresh(secondary)

    with patch(
        "app.modules.identity.service.send_notification_email", new_callable=AsyncMock
    ) as notify:
        response = await client.post(
            f"/api/v1/auth/me/emails/{secondary.id}/primary",
            headers=await _auth(user, db, mock_redis),
        )

    assert response.status_code == 200
    notify.assert_awaited_once()
    recipient, message = notify.await_args.args
    assert recipient == "old-primary@example.com"
    assert "new-primary@example.com" in message.html


async def test_promoting_the_current_primary_notifies_no_one(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock
) -> None:
    user = await _verified_user(db, "only@example.com")
    primary = (
        await db.execute(select(EmailAddress).where(EmailAddress.user_id == user.id))
    ).scalar_one()

    with patch(
        "app.modules.identity.service.send_notification_email", new_callable=AsyncMock
    ) as notify:
        response = await client.post(
            f"/api/v1/auth/me/emails/{primary.id}/primary",
            headers=await _auth(user, db, mock_redis),
        )

    assert response.status_code == 200
    notify.assert_not_awaited()
