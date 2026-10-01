"""add flexible email template and inline content

Revision ID: f7463e16a2c4
Revises: b4f6a9c2d815
Create Date: 2026-10-01 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f7463e16a2c4"
down_revision: str | None = "b4f6a9c2d815"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add template policy/text and persisted inline/rendered text content."""
    op.add_column("templates", sa.Column("text_body", sa.Text(), nullable=True))
    op.add_column(
        "templates", sa.Column("on_missing_variable", sa.String(length=16), nullable=True)
    )
    op.execute("UPDATE templates SET on_missing_variable = 'blank'")
    op.alter_column(
        "templates",
        "on_missing_variable",
        nullable=False,
        server_default="error",
    )
    op.add_column(
        "events", sa.Column("inline_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )
    op.add_column("notifications", sa.Column("rendered_text", sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove flexible email content fields."""
    op.drop_column("notifications", "rendered_text")
    op.drop_column("events", "inline_content")
    op.drop_column("templates", "on_missing_variable")
    op.drop_column("templates", "text_body")
