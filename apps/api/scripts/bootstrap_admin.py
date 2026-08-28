"""Promote an existing verified user to the first platform administrator.

Example:
    uv run python -m scripts.bootstrap_admin --email me@michaelogunjimi.com
"""

import argparse
import asyncio

from sqlalchemy import select
from sqlmodel import col

from app.core.database import async_session
from app.modules.admin.types import AdminRole
from app.modules.admin.users.model import AdminUser
from app.modules.identity.models.email_address import EmailAddress
from app.modules.identity.models.user import User


async def bootstrap_admin(email: str) -> AdminUser:
    normalized = email.strip().lower()
    async with async_session() as db:
        user = (
            await db.execute(
                select(User)
                .join(EmailAddress, col(EmailAddress.user_id) == col(User.id))
                .where(
                    col(EmailAddress.email) == normalized,
                    col(EmailAddress.verified_at).is_not(None),
                )
            )
        ).scalar_one_or_none()
        if user is None:
            raise ValueError("A verified user with that email was not found")
        admin = (
            await db.execute(select(AdminUser).where(col(AdminUser.user_id) == user.id))
        ).scalar_one_or_none()
        if admin is None:
            admin = AdminUser(user_id=user.id, role=AdminRole.SUPER_ADMIN)
        else:
            admin.role = AdminRole.SUPER_ADMIN
            admin.is_active = True
        db.add(admin)
        await db.commit()
        return admin


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    admin = asyncio.run(bootstrap_admin(args.email))
    print(f"Platform super administrator ready: {admin.id}")


if __name__ == "__main__":
    main()
