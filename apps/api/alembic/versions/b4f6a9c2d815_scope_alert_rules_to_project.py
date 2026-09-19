"""scope alert rules to project instead of api key

Revision ID: b4f6a9c2d815
Revises: b2c3d4e5f6a7
Create Date: 2026-09-18 02:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b4f6a9c2d815"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # alert_rules has never had a row written to it — no evaluator ever
    # existed to create one — so this is a straight column swap, no backfill.
    op.drop_index("ix_alert_rules_api_key_id", table_name="alert_rules")
    op.drop_column("alert_rules", "api_key_id")
    op.add_column(
        "alert_rules",
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=False),
    )
    op.create_index("ix_alert_rules_project_id", "alert_rules", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_alert_rules_project_id", table_name="alert_rules")
    op.drop_column("alert_rules", "project_id")
    op.add_column(
        "alert_rules",
        sa.Column("api_key_id", sa.Uuid(), sa.ForeignKey("api_keys.id"), nullable=False),
    )
    op.create_index("ix_alert_rules_api_key_id", "alert_rules", ["api_key_id"])
