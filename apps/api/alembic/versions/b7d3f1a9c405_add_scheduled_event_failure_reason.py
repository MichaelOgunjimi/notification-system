"""add scheduled event failure reason

Revision ID: b7d3f1a9c405
Revises: a1c5e7b9d302
Create Date: 2026-10-07 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7d3f1a9c405"
down_revision: str | None = "a1c5e7b9d302"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Record why a scheduled event failed or expired."""
    op.add_column("scheduled_events", sa.Column("failure_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    """Drop the failure reason."""
    op.drop_column("scheduled_events", "failure_reason")
