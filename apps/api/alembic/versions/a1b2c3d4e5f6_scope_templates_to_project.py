"""scope templates to project instead of api key

Revision ID: a1b2c3d4e5f6
Revises: 7c9e2f4a1b63
Create Date: 2026-09-05 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "7c9e2f4a1b63"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "templates",
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=True),
    )
    op.create_index("ix_templates_project_id", "templates", ["project_id"])

    # Backfill: every key in a project now shares one template pool, so a
    # template's project is whichever project created it via its api key.
    # NULL api_key_id (already a system default) stays NULL project_id.
    op.execute(
        """
        UPDATE templates t
        SET project_id = k.project_id
        FROM api_keys k
        WHERE t.api_key_id = k.id
        """
    )

    op.create_index(
        "uq_templates_project_name_channel",
        "templates",
        ["project_id", "name", "channel"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )


def downgrade() -> None:
    op.drop_index("uq_templates_project_name_channel", table_name="templates")
    op.drop_index("ix_templates_project_id", table_name="templates")
    op.drop_column("templates", "project_id")
