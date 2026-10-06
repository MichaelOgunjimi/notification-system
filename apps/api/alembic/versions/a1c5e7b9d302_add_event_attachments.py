"""add event attachments

Revision ID: a1c5e7b9d302
Revises: e9b2d4f6a038
Create Date: 2026-10-06 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1c5e7b9d302"
down_revision: str | None = "e9b2d4f6a038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add URL-referenced email attachments to events."""
    op.add_column(
        "events", sa.Column("attachments", postgresql.JSONB(astext_type=sa.Text()), nullable=True)
    )


def downgrade() -> None:
    """Drop event attachments."""
    op.drop_column("events", "attachments")
