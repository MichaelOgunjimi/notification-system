"""add_cancelled_to_eventstatus

Revision ID: 109c5dd5325d
Revises: 29f6a434b771
Create Date: 2026-04-10 00:26:19.979740
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "109c5dd5325d"
down_revision: str | None = "29f6a434b771"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TYPE eventstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    raise NotImplementedError(
        "PostgreSQL does not support removing enum values. "
        "Downgrading this migration requires a manual schema rewrite. "
        "See: https://www.postgresql.org/docs/current/sql-altertype.html"
    )
