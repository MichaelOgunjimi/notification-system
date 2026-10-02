"""add alert rule comparison direction

Revision ID: c7a2e8f1b934
Revises: b4f6a9c2d815
Create Date: 2026-09-18 03:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c7a2e8f1b934"
down_revision: str | None = "b4f6a9c2d815"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "alert_rules",
        sa.Column("comparison", sa.String(length=10), nullable=False, server_default="gt"),
    )
    op.alter_column("alert_rules", "comparison", server_default=None)


def downgrade() -> None:
    op.drop_column("alert_rules", "comparison")
