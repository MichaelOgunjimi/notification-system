"""add_suppressions_and_alert_rules

Revision ID: 3f1f50970239
Revises: 6b8f2db8f6b1
Create Date: 2026-04-15 06:38:48.184036
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3f1f50970239"
down_revision: str | None = "6b8f2db8f6b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "suppressions" not in table_names:
        op.create_table(
            "suppressions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("api_key_id", sa.Uuid(), nullable=False),
            sa.Column(
                "channel",
                sa.Enum("EMAIL", "SMS", "WEBHOOK", name="notificationchannel", create_type=False),
                nullable=False,
            ),
            sa.Column("recipient", sa.String(length=500), nullable=False),
            sa.Column("reason", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["api_key_id"], ["api_keys.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_suppressions_api_key_id"), "suppressions", ["api_key_id"], unique=False)

    if "alert_rules" not in table_names:
        op.create_table(
            "alert_rules",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("api_key_id", sa.Uuid(), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("metric", sa.String(length=100), nullable=False),
            sa.Column("threshold", sa.Float(), nullable=False),
            sa.Column("window_minutes", sa.Integer(), nullable=False),
            sa.Column("notify_email", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("last_triggered_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["api_key_id"], ["api_keys.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_alert_rules_api_key_id"), "alert_rules", ["api_key_id"], unique=False)
        return

    alert_columns = {column["name"] for column in inspector.get_columns("alert_rules")}
    if "updated_at" not in alert_columns:
        op.add_column("alert_rules", sa.Column("updated_at", sa.DateTime(), nullable=True))
        op.execute("UPDATE alert_rules SET updated_at = created_at WHERE updated_at IS NULL")
        op.alter_column("alert_rules", "updated_at", nullable=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "suppressions" in table_names:
        op.drop_index(op.f("ix_suppressions_api_key_id"), table_name="suppressions")
        op.drop_table("suppressions")

    if "alert_rules" in table_names:
        op.drop_index(op.f("ix_alert_rules_api_key_id"), table_name="alert_rules")
        op.drop_table("alert_rules")
