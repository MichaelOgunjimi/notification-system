"""add email sender fields to templates

Revision ID: a8d3c5e1b947
Revises: f7463e16a2c4
Create Date: 2026-10-02 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a8d3c5e1b947"
down_revision: str | None = "f7463e16a2c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add optional sender identity and Reply-To to templates."""
    op.add_column("templates", sa.Column("from_local", sa.String(length=64), nullable=True))
    op.add_column("templates", sa.Column("from_name", sa.String(length=100), nullable=True))
    op.add_column("templates", sa.Column("reply_to", sa.String(length=320), nullable=True))


def downgrade() -> None:
    """Remove template sender fields."""
    op.drop_column("templates", "reply_to")
    op.drop_column("templates", "from_name")
    op.drop_column("templates", "from_local")
