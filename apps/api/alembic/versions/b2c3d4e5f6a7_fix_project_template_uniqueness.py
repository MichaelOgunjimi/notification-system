"""fix project template uniqueness

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-05 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Replace API-key uniqueness with project and system-default boundaries."""
    # Earlier installations can contain all three legacy indexes. IF EXISTS
    # also keeps the correction safe for a database created from a schema model.
    op.execute("DROP INDEX IF EXISTS uq_templates_per_key_active")
    op.execute("DROP INDEX IF EXISTS uq_templates_project_name_channel")
    op.execute("DROP INDEX IF EXISTS uq_templates_project_active")
    op.execute("DROP INDEX IF EXISTS uq_templates_system_default_active")

    op.create_index(
        "uq_templates_project_active",
        "templates",
        ["project_id", "name", "channel"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL AND is_active = true"),
    )
    op.create_index(
        "uq_templates_system_default_active",
        "templates",
        ["name", "channel"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL AND is_active = true"),
    )


def downgrade() -> None:
    """Restore the constraints present before project uniqueness was corrected."""
    op.drop_index("uq_templates_system_default_active", table_name="templates")
    op.drop_index("uq_templates_project_active", table_name="templates")
    op.create_index(
        "uq_templates_project_name_channel",
        "templates",
        ["project_id", "name", "channel"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index(
        "uq_templates_per_key_active",
        "templates",
        ["api_key_id", "name", "channel"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index(
        "uq_templates_system_default_active",
        "templates",
        ["name", "channel"],
        unique=True,
        postgresql_where=sa.text("api_key_id IS NULL AND is_active = true"),
    )
