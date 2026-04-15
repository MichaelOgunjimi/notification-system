"""add_scheduled_events

Revision ID: ad59136da2d9
Revises: 3f1f50970239
Create Date: 2026-04-15 06:55:46.792712
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ad59136da2d9'
down_revision: Union[str, None] = '3f1f50970239'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('scheduled_events',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('api_key_id', sa.Uuid(), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('scheduled_for', sa.DateTime(), nullable=False),
    sa.Column(
        'priority',
        postgresql.ENUM('HIGH', 'MEDIUM', 'LOW', name='eventpriority', create_type=False),
        nullable=False,
    ),
    sa.Column('status', sa.Enum('PENDING', 'PROCESSING', 'DISPATCHED', 'CANCELLED', 'FAILED', name='scheduledeventstatus'), nullable=False),
    sa.Column('event_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['api_key_id'], ['api_keys.id'], ),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_scheduled_events_api_key_id', 'scheduled_events', ['api_key_id'], unique=False)
    op.create_index('idx_scheduled_events_scheduled_for', 'scheduled_events', ['scheduled_for'], unique=False)
    op.create_index('idx_scheduled_events_status', 'scheduled_events', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_scheduled_events_status', table_name='scheduled_events')
    op.drop_index('idx_scheduled_events_scheduled_for', table_name='scheduled_events')
    op.drop_index('idx_scheduled_events_api_key_id', table_name='scheduled_events')
    op.drop_table('scheduled_events')
