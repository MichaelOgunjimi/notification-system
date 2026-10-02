"""add org-wide alert rules

Revision ID: d8e1f4a7c250
Revises: c7a2e8f1b934
Create Date: 2026-09-18 04:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d8e1f4a7c250"
down_revision: str | None = "c7a2e8f1b934"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("alert_rules", "project_id", nullable=True)
    op.add_column(
        "alert_rules",
        sa.Column(
            "organization_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=True
        ),
    )
    op.create_index("ix_alert_rules_organization_id", "alert_rules", ["organization_id"])

    op.create_table(
        "alert_rule_triggers",
        sa.Column("rule_id", sa.Uuid(), sa.ForeignKey("alert_rules.id"), primary_key=True),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("last_triggered_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("alert_rule_triggers")
    op.drop_index("ix_alert_rules_organization_id", table_name="alert_rules")
    op.drop_column("alert_rules", "organization_id")
    op.alter_column("alert_rules", "project_id", nullable=False)
