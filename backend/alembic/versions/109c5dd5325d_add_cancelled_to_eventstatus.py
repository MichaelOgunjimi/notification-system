"""add_cancelled_to_eventstatus

Revision ID: 109c5dd5325d
Revises: 29f6a434b771
Create Date: 2026-04-10 00:26:19.979740
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '109c5dd5325d'
down_revision: Union[str, None] = '29f6a434b771'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE eventstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    # Postgres does not support removing enum values; downgrade is a no-op.
    pass
