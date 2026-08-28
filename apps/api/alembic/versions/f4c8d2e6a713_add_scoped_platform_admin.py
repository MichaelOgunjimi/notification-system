"""add scoped platform administration

Revision ID: f4c8d2e6a713
Revises: e3b9a1c7d502
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f4c8d2e6a713"
down_revision: str | None = "e3b9a1c7d502"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    admin_role = postgresql.ENUM(
        "SUPER_ADMIN",
        "ADMIN",
        "SUPPORT",
        "AUDITOR",
        name="adminrole",
        create_type=False,
    )
    postgresql.ENUM(
        "SUPER_ADMIN",
        "ADMIN",
        "SUPPORT",
        "AUDITOR",
        name="adminrole",
    ).create(op.get_bind(), checkfirst=True)
    op.create_table(
        "admin_users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", admin_role, nullable=False),
        sa.Column("permissions", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by_admin_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_admin_user_id"], ["admin_users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_admin_users_is_active", "admin_users", ["is_active"])
    op.create_index("ix_admin_users_user_id", "admin_users", ["user_id"], unique=True)

    op.create_table(
        "system_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by_admin_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_admin_user_id"], ["admin_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_system_accounts_is_active", "system_accounts", ["is_active"])
    op.create_index("ix_system_accounts_slug", "system_accounts", ["slug"], unique=True)
    op.create_index(
        "ix_system_accounts_created_by_admin_user_id",
        "system_accounts",
        ["created_by_admin_user_id"],
    )

    op.create_table(
        "system_credentials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("system_account_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("key_prefix", sa.String(16), nullable=False),
        sa.Column("permissions", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["system_account_id"], ["system_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key_hash"),
        sa.UniqueConstraint(
            "system_account_id",
            "name",
            name="uq_system_credentials_account_name",
        ),
    )
    op.create_index(
        "ix_system_credentials_system_account_id",
        "system_credentials",
        ["system_account_id"],
    )
    op.create_index("ix_system_credentials_key_hash", "system_credentials", ["key_hash"], unique=True)
    op.create_index("ix_system_credentials_key_prefix", "system_credentials", ["key_prefix"])
    op.create_index("ix_system_credentials_is_active", "system_credentials", ["is_active"])


def downgrade() -> None:
    op.drop_table("system_credentials")
    op.drop_table("system_accounts")
    op.drop_table("admin_users")
    postgresql.ENUM(name="adminrole").drop(op.get_bind(), checkfirst=True)
