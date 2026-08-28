"""require every API key to belong to a project

Revision ID: c84d7e2f9a11
Revises: b17c2a8d4e90
Create Date: 2026-08-28 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c84d7e2f9a11"
down_revision: str | None = "b17c2a8d4e90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("api_keys", "project_id", existing_type=sa.Uuid(), nullable=False)
    op.alter_column("api_keys", "created_by_user_id", existing_type=sa.Uuid(), nullable=False)
    op.alter_column(
        "api_keys",
        "scopes",
        existing_type=sa.JSON(),
        nullable=False,
        server_default=None,
    )


def downgrade() -> None:
    op.alter_column("api_keys", "project_id", existing_type=sa.Uuid(), nullable=True)
    op.alter_column("api_keys", "created_by_user_id", existing_type=sa.Uuid(), nullable=True)
    op.alter_column(
        "api_keys",
        "scopes",
        existing_type=sa.JSON(),
        nullable=False,
        server_default=sa.text("'[]'::json"),
    )
