"""add_suppression_reason_source_fields

Revision ID: a94aaf48049b
Revises: ad59136da2d9
Create Date: 2026-04-15 07:46:49.418054
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a94aaf48049b'
down_revision: Union[str, None] = 'ad59136da2d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    suppression_reason = postgresql.ENUM(
        "HARD_BOUNCE",
        "SPAM_COMPLAINT",
        "MANUAL",
        name="suppressionreason",
        create_type=False,
    )
    suppression_source = postgresql.ENUM(
        "SYSTEM",
        "CLIENT",
        name="suppressionsource",
        create_type=False,
    )

    suppression_reason.create(op.get_bind(), checkfirst=True)
    suppression_source.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "suppressions",
        sa.Column(
            "source",
            suppression_source,
            nullable=True,
            server_default=sa.text("'CLIENT'"),
        ),
    )

    # Safe upgrade for existing rows before enforcing NOT NULL.
    op.execute("UPDATE suppressions SET reason = 'manual' WHERE reason IS NULL")
    op.execute("UPDATE suppressions SET source = 'CLIENT' WHERE source IS NULL")

    op.alter_column(
        "suppressions",
        "reason",
        existing_type=sa.VARCHAR(),
        type_=suppression_reason,
        postgresql_using="UPPER(reason)::suppressionreason",
        nullable=False,
        server_default=sa.text("'MANUAL'"),
    )
    op.alter_column(
        "suppressions",
        "source",
        existing_type=suppression_source,
        nullable=False,
        server_default=sa.text("'CLIENT'"),
    )


def downgrade() -> None:
    suppression_reason = postgresql.ENUM(
        "HARD_BOUNCE",
        "SPAM_COMPLAINT",
        "MANUAL",
        name="suppressionreason",
        create_type=False,
    )
    suppression_source = postgresql.ENUM(
        "SYSTEM",
        "CLIENT",
        name="suppressionsource",
        create_type=False,
    )

    op.alter_column(
        "suppressions",
        "reason",
        existing_type=suppression_reason,
        type_=sa.VARCHAR(),
        postgresql_using="LOWER(reason::text)",
        nullable=True,
        server_default=None,
    )
    op.drop_column("suppressions", "source")

    suppression_source.drop(op.get_bind(), checkfirst=True)
    suppression_reason.drop(op.get_bind(), checkfirst=True)
