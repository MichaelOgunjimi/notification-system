"""Secondary email address management and link-based verification."""

import json
from datetime import timedelta
from unittest.mock import patch

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.datetime import utc_now
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User
from app.modules.identity.service import create_user_tokens


async def _auth(user: User, db: AsyncSession, redis) -> dict[str, str]:
    tokens = await create_user_tokens(user, db, redis)
    return {"Authorization": f"Bearer {tokens.access_token}"}


async def _user_with_primary(db: AsyncSession, email: str, name: str = "Person") -> User:
    user = User(email=email, name=name)
    db.add(user)
    await db.flush()
    db.add(EmailAddress(user_id=user.id, email=email, is_primary=True, verified_at=utc_now()))
    await db.commit()
    return user


async def test_list_returns_the_users_addresses_with_flags(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    user = await _user_with_primary(db, "list-primary@example.com")
    db.add(EmailAddress(user_id=user.id, email="list-extra@example.com"))
    await db.commit()

    response = await client.get("/api/v1/auth/me/emails", headers=await _auth(user, db, mock_redis))

    assert response.status_code == 200
    by_email = {row["email"]: row for row in response.json()}
    assert by_email["list-primary@example.com"]["is_primary"] is True
    assert by_email["list-primary@example.com"]["verified_at"] is not None
    assert by_email["list-extra@example.com"]["is_primary"] is False
    assert by_email["list-extra@example.com"]["verified_at"] is None


async def test_add_email_creates_an_unverified_row_and_sends_a_link(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    user = await _user_with_primary(db, "adder@example.com")

    with patch("app.modules.identity.service.EmailAdapter.send") as send_email:
        response = await client.post(
            "/api/v1/auth/me/emails",
            headers=await _auth(user, db, mock_redis),
            json={"email": "  Second.Address@Example.COM "},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "second.address@example.com"
    assert body["is_primary"] is False
    assert body["verified_at"] is None

    row = (
        await db.execute(
            select(EmailAddress).where(EmailAddress.email == "second.address@example.com")
        )
    ).scalar_one()
    assert row.user_id == user.id
    cache_key, _ttl, payload = mock_redis.setex.await_args.args
    assert cache_key.startswith("email_verify:")
    assert json.loads(payload) == {"email_address_id": str(row.id)}
    sent_body = send_email.call_args.args[2]
    assert "/auth/verify-email?token=" in sent_body


async def test_add_email_rejects_an_address_owned_by_another_user(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    owner = await _user_with_primary(db, "owns-it@example.com")
    del owner
    intruder = await _user_with_primary(db, "intruder@example.com")

    response = await client.post(
        "/api/v1/auth/me/emails",
        headers=await _auth(intruder, db, mock_redis),
        json={"email": "owns-it@example.com"},
    )

    assert response.status_code == 409


async def test_add_email_reclaims_a_stale_unverified_squat(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    squatter = await _user_with_primary(db, "squatter@example.com")
    stale = EmailAddress(
        user_id=squatter.id,
        email="contested@example.com",
        created_at=utc_now() - timedelta(days=1),
    )
    db.add(stale)
    await db.commit()
    stale_id = stale.id
    claimant = await _user_with_primary(db, "claimant@example.com")

    with patch("app.modules.identity.service.EmailAdapter.send"):
        response = await client.post(
            "/api/v1/auth/me/emails",
            headers=await _auth(claimant, db, mock_redis),
            json={"email": "contested@example.com"},
        )

    assert response.status_code == 201
    row = (
        await db.execute(select(EmailAddress).where(EmailAddress.email == "contested@example.com"))
    ).scalar_one()
    assert row.user_id == claimant.id
    assert row.id != stale_id


async def test_verify_email_marks_the_address_verified_without_a_session(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    user = await _user_with_primary(db, "verifier@example.com")
    pending = EmailAddress(user_id=user.id, email="pending@example.com")
    db.add(pending)
    await db.commit()
    mock_redis.getdel.return_value = json.dumps({"email_address_id": str(pending.id)})

    response = await client.post("/api/v1/auth/emails/verify", json={"token": "verify-token"})

    assert response.status_code == 200
    await db.refresh(pending)
    assert pending.verified_at is not None


async def test_verify_email_rejects_a_consumed_token(client: AsyncClient, mock_redis) -> None:
    mock_redis.getdel.return_value = None

    response = await client.post("/api/v1/auth/emails/verify", json={"token": "already-used"})

    assert response.status_code == 400


async def test_set_primary_promotes_a_verified_address_and_updates_user_email(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    user = await _user_with_primary(db, "old-primary@example.com")
    promoted = EmailAddress(
        user_id=user.id,
        email="new-primary@example.com",
        verified_at=utc_now(),
    )
    db.add(promoted)
    await db.commit()

    response = await client.post(
        f"/api/v1/auth/me/emails/{promoted.id}/primary",
        headers=await _auth(user, db, mock_redis),
    )

    assert response.status_code == 200
    rows = {
        row.email: row.is_primary
        for row in (
            await db.execute(
                select(EmailAddress)
                .where(EmailAddress.user_id == user.id)
                .execution_options(populate_existing=True)
            )
        ).scalars()
    }
    assert rows == {"old-primary@example.com": False, "new-primary@example.com": True}
    await db.refresh(user)
    assert user.email == "new-primary@example.com"


async def test_set_primary_refuses_an_unverified_address(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    user = await _user_with_primary(db, "stays-primary@example.com")
    unverified = EmailAddress(user_id=user.id, email="unverified@example.com")
    db.add(unverified)
    await db.commit()

    response = await client.post(
        f"/api/v1/auth/me/emails/{unverified.id}/primary",
        headers=await _auth(user, db, mock_redis),
    )

    assert response.status_code == 422


async def test_remove_email_deletes_a_secondary_but_not_the_primary(
    client: AsyncClient, db: AsyncSession, mock_redis
) -> None:
    user = await _user_with_primary(db, "keeper@example.com")
    secondary = EmailAddress(user_id=user.id, email="disposable@example.com")
    db.add(secondary)
    await db.commit()
    headers = await _auth(user, db, mock_redis)

    primary = (
        await db.execute(
            select(EmailAddress).where(
                EmailAddress.user_id == user.id, EmailAddress.is_primary.is_(True)
            )
        )
    ).scalar_one()

    remove_secondary = await client.delete(
        f"/api/v1/auth/me/emails/{secondary.id}", headers=headers
    )
    remove_primary = await client.delete(f"/api/v1/auth/me/emails/{primary.id}", headers=headers)

    assert remove_secondary.status_code == 204
    assert remove_primary.status_code == 409
    remaining = (
        (await db.execute(select(EmailAddress).where(EmailAddress.user_id == user.id)))
        .scalars()
        .all()
    )
    assert {row.email for row in remaining} == {"keeper@example.com"}


async def test_email_management_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me/emails")).status_code == 401
    assert (
        await client.post("/api/v1/auth/me/emails", json={"email": "x@example.com"})
    ).status_code == 401
