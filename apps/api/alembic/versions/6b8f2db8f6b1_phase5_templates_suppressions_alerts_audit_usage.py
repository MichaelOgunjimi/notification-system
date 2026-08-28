"""phase5_templates_suppressions_alerts_audit_usage

Revision ID: 6b8f2db8f6b1
Revises: 109c5dd5325d
Create Date: 2026-04-12 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "6b8f2db8f6b1"
down_revision: str | None = "109c5dd5325d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("templates", sa.Column("api_key_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_templates_api_key_id"), "templates", ["api_key_id"], unique=False)
    op.create_foreign_key(
        "fk_templates_api_key_id_api_keys",
        "templates",
        "api_keys",
        ["api_key_id"],
        ["id"],
    )
    op.execute("UPDATE templates SET api_key_id = created_by WHERE created_by IS NOT NULL")

    op.drop_index("uq_templates_name_channel", table_name="templates")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_templates_per_key_active
        ON templates (api_key_id, name, channel)
        WHERE is_active = true
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_templates_system_default_active
        ON templates (name, channel)
        WHERE api_key_id IS NULL AND is_active = true
        """
    )

    op.drop_column("templates", "created_by")
    op.drop_column("templates", "metadata")
    op.drop_column("templates", "version")

    op.create_table(
        "suppressions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_key_id", sa.Uuid(), nullable=False),
        sa.Column(
            "channel",
            postgresql.ENUM(
                "EMAIL",
                "SMS",
                "WEBHOOK",
                name="notificationchannel",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("recipient", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("reason", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["api_key_id"], ["api_keys.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "api_key_id",
            "channel",
            "recipient",
            name="uq_suppressions_key_channel_recipient",
        ),
    )
    op.create_index(op.f("ix_suppressions_api_key_id"), "suppressions", ["api_key_id"], unique=False)

    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_key_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("metric", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("window_minutes", sa.Integer(), nullable=False),
        sa.Column("notify_email", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_triggered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["api_key_id"], ["api_keys.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_alert_rules_api_key_id"), "alert_rules", ["api_key_id"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_key_id", sa.Uuid(), nullable=True),
        sa.Column("action", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("resource_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("resource_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("ip_address", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["api_key_id"], ["api_keys.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_api_key_id"), "audit_logs", ["api_key_id"], unique=False)

    op.create_table(
        "api_key_usage",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("api_key_id", sa.Uuid(), nullable=False),
        sa.Column("endpoint", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("method", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("hour_bucket", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["api_key_id"], ["api_keys.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "api_key_id",
            "endpoint",
            "method",
            "status_code",
            "hour_bucket",
            name="uq_api_key_usage_bucket",
        ),
    )
    op.create_index(op.f("ix_api_key_usage_api_key_id"), "api_key_usage", ["api_key_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_api_key_usage_api_key_id"), table_name="api_key_usage")
    op.drop_table("api_key_usage")

    op.drop_index(op.f("ix_audit_logs_api_key_id"), table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index(op.f("ix_alert_rules_api_key_id"), table_name="alert_rules")
    op.drop_table("alert_rules")

    op.drop_index(op.f("ix_suppressions_api_key_id"), table_name="suppressions")
    op.drop_table("suppressions")

    op.add_column("templates", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("templates", sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text())))
    op.add_column("templates", sa.Column("created_by", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_templates_created_by_api_keys",
        "templates",
        "api_keys",
        ["created_by"],
        ["id"],
    )
    op.execute("UPDATE templates SET created_by = api_key_id WHERE api_key_id IS NOT NULL")

    op.execute("DROP INDEX IF EXISTS uq_templates_per_key_active")
    op.execute("DROP INDEX IF EXISTS uq_templates_system_default_active")
    op.create_index(
        "uq_templates_name_channel",
        "templates",
        ["name", "channel"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )

    op.drop_constraint("fk_templates_api_key_id_api_keys", "templates", type_="foreignkey")
    op.drop_index(op.f("ix_templates_api_key_id"), table_name="templates")
    op.drop_column("templates", "api_key_id")
