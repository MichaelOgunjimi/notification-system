"""add user profile avatar

Revision ID: 7c9e2f4a1b63
Revises: f4c8d2e6a713
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7c9e2f4a1b63"
down_revision: str | None = "f4c8d2e6a713"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add profile avatars and seed existing users from their first OAuth account."""
    op.add_column("users", sa.Column("avatar_url", sa.String(length=2048), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE users AS app_user
            SET avatar_url = provider_avatar.avatar_url
            FROM (
                SELECT DISTINCT ON (user_id) user_id, avatar_url
                FROM oauth_accounts
                WHERE avatar_url IS NOT NULL
                ORDER BY user_id, created_at ASC
            ) AS provider_avatar
            WHERE app_user.id = provider_avatar.user_id
              AND app_user.avatar_url IS NULL
            """
        )
    )


def downgrade() -> None:
    """Remove the application-owned avatar URL from human users."""
    op.drop_column("users", "avatar_url")
