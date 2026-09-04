"""Lifecycle notification emails: rendering and best-effort dispatch."""

import json
import uuid
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
        "app.modules.delivery.notify.send_notification_email", new_callable=AsyncMock
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
        "app.modules.delivery.notify.send_notification_email", new_callable=AsyncMock
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
        "app.modules.delivery.notify.send_notification_email", new_callable=AsyncMock
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
        "app.modules.delivery.notify.send_notification_email", new_callable=AsyncMock
    ) as notify:
        response = await client.post(
            f"/api/v1/auth/me/emails/{primary.id}/primary",
            headers=await _auth(user, db, mock_redis),
        )

    assert response.status_code == 200
    notify.assert_not_awaited()


async def _member_of(
    db: AsyncSession, organization_id, email: str, role: str = "member"
) -> tuple[User, str]:
    from app.modules.tenancy.models.organization import OrganizationMembership, OrganizationRole

    member = await _verified_user(db, email, name=email.partition("@")[0])
    membership = OrganizationMembership(
        organization_id=organization_id, user_id=member.id, role=OrganizationRole(role)
    )
    db.add(membership)
    await db.commit()
    await db.refresh(membership)
    return member, str(membership.id)


async def test_removing_a_member_notifies_them(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock
) -> None:
    from app.modules.tenancy.lifecycle import create_organization

    owner = await _verified_user(db, "owner-rm@example.com", name="Owner")
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme-rm")
    await db.commit()
    _member, membership_id = await _member_of(db, organization.id, "dropped@example.com")

    with patch(
        "app.modules.delivery.notify.send_notification_email", new_callable=AsyncMock
    ) as notify:
        response = await client.delete(
            f"/api/v1/organizations/{organization.id}/members/{membership_id}",
            headers=await _auth(owner, db, mock_redis),
        )

    assert response.status_code == 204
    notify.assert_awaited_once()
    recipient, message = notify.await_args.args
    assert recipient == "dropped@example.com"
    assert "Acme" in message.html


async def test_removing_a_member_succeeds_even_when_the_notification_fails(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock
) -> None:
    from app.modules.tenancy.lifecycle import create_organization
    from app.modules.tenancy.models.organization import OrganizationMembership

    owner = await _verified_user(db, "owner-rm2@example.com", name="Owner")
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme-rm2")
    await db.commit()
    _member, membership_id = await _member_of(db, organization.id, "dropped2@example.com")

    # Fail at the provider boundary so the real best-effort helper runs and swallows it.
    with patch(
        "app.modules.delivery.notifications.EmailAdapter.send",
        side_effect=RuntimeError("smtp down"),
    ):
        response = await client.delete(
            f"/api/v1/organizations/{organization.id}/members/{membership_id}",
            headers=await _auth(owner, db, mock_redis),
        )

    assert response.status_code == 204
    gone = (
        await db.execute(
            select(OrganizationMembership).where(
                OrganizationMembership.id == uuid.UUID(membership_id)
            )
        )
    ).scalar_one_or_none()
    assert gone is None


async def test_changing_a_members_role_notifies_the_member_not_the_actor(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock
) -> None:
    from app.modules.tenancy.lifecycle import create_organization

    owner = await _verified_user(db, "owner-role@example.com", name="Owner")
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme-role")
    await db.commit()
    _member, membership_id = await _member_of(db, organization.id, "promoted@example.com")

    with patch(
        "app.modules.delivery.notify.send_notification_email", new_callable=AsyncMock
    ) as notify:
        response = await client.patch(
            f"/api/v1/organizations/{organization.id}/members/{membership_id}",
            headers=await _auth(owner, db, mock_redis),
            json={"role": "admin"},
        )

    assert response.status_code == 200
    notify.assert_awaited_once()
    recipient, message = notify.await_args.args
    assert recipient == "promoted@example.com"
    assert "Admin" in message.html


async def test_setting_a_members_role_to_its_current_value_notifies_no_one(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock
) -> None:
    from app.modules.tenancy.lifecycle import create_organization

    owner = await _verified_user(db, "owner-noop@example.com", name="Owner")
    organization = await create_organization(db, owner=owner, name="Acme", slug="acme-noop")
    await db.commit()
    _member, membership_id = await _member_of(
        db, organization.id, "steady@example.com", role="member"
    )

    with patch(
        "app.modules.delivery.notify.send_notification_email", new_callable=AsyncMock
    ) as notify:
        response = await client.patch(
            f"/api/v1/organizations/{organization.id}/members/{membership_id}",
            headers=await _auth(owner, db, mock_redis),
            json={"role": "member"},
        )

    assert response.status_code == 200
    notify.assert_not_awaited()


async def _create_invitation(
    client: AsyncClient, db: AsyncSession, redis, monkeypatch, *, token: str
) -> tuple[User, str, str]:
    from app.modules.tenancy.lifecycle import create_organization

    owner = await _verified_user(db, f"inv-owner-{token}@example.com", name="Inviting Owner")
    invitee = await _verified_user(db, f"inv-joiner-{token}@example.com", name="Joiner")
    organization = await create_organization(
        db, owner=owner, name="Invite Co", slug=f"invite-co-{token}"
    )
    await db.commit()
    monkeypatch.setattr(
        "app.modules.tenancy.invitations.service.secrets.token_urlsafe",
        lambda _length: token,
    )
    created = await client.post(
        f"/api/v1/organizations/{organization.id}/invitations",
        headers=await _auth(owner, db, redis),
        json={"email": invitee.email, "role": "member"},
    )
    assert created.status_code == 201
    return owner, invitee.email, token


async def test_accepting_an_invitation_notifies_the_inviter(
    client: AsyncClient, db: AsyncSession, mock_redis: AsyncMock, monkeypatch
) -> None:
    owner, joiner_email, token = await _create_invitation(
        client, db, mock_redis, monkeypatch, token="accept-notify-token"
    )
    joiner = (await db.execute(select(User).where(User.email == joiner_email))).scalar_one()

    with patch(
        "app.modules.delivery.notify.send_notification_email",
        new_callable=AsyncMock,
    ) as notify:
        response = await client.post(
            "/api/v1/invitations/accept",
            headers=await _auth(joiner, db, mock_redis),
            json={"token": token},
        )

    assert response.status_code == 204
    notify.assert_awaited_once()
    recipient, message = notify.await_args.args
    assert recipient == owner.email
    assert joiner_email in message.html
    assert "Invite Co" in message.html


async def test_inviter_notification_is_silent_when_the_inviter_row_is_gone(
    db: AsyncSession,
) -> None:
    from app.modules.tenancy.invitations.service import _notify_inviter_of_acceptance

    with patch(
        "app.modules.delivery.notify.send_notification_email",
        new_callable=AsyncMock,
    ) as notify:
        # invited_by_user_id points at no existing user (deleted inviter).
        await _notify_inviter_of_acceptance(
            db,
            invited_by_user_id=uuid.uuid4(),
            organization_id=uuid.uuid4(),
            invitee_email="joiner@example.com",
            invitee_role="member",
        )
        # And the null case.
        await _notify_inviter_of_acceptance(
            db,
            invited_by_user_id=None,
            organization_id=uuid.uuid4(),
            invitee_email="joiner@example.com",
            invitee_role="member",
        )

    notify.assert_not_awaited()
