"""add_expired_to_scheduledeventstatus

Revision ID: dbd2fccd9108
Revises: a94aaf48049b
Create Date: 2026-04-15 11:29:26.707747
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'dbd2fccd9108'
down_revision: Union[str, None] = 'a94aaf48049b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE scheduledeventstatus ADD VALUE IF NOT EXISTS 'EXPIRED'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is a no-op
    pass
