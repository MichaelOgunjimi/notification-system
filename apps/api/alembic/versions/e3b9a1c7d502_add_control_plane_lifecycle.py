"""add control plane lifecycle

Revision ID: e3b9a1c7d502
Revises: c84d7e2f9a11
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e3b9a1c7d502"
down_revision: str | None = "c84d7e2f9a11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("description", sa.String(1000), nullable=True))
    op.add_column(
        "organizations",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("organizations", sa.Column("archived_at", sa.DateTime(), nullable=True))
    op.create_index("ix_organizations_archived_at", "organizations", ["archived_at"])

    op.add_column("organization_memberships", sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))

    op.add_column("projects", sa.Column("description", sa.String(1000), nullable=True))
    op.add_column(
        "projects",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("projects", sa.Column("archived_at", sa.DateTime(), nullable=True))
    op.create_index("ix_projects_archived_at", "projects", ["archived_at"])

    op.add_column(
        "api_keys",
        sa.Column("environment", sa.String(20), server_default="live", nullable=False),
    )
    op.create_index("ix_api_keys_environment", "api_keys", ["environment"])
    op.add_column(
        "api_keys",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("api_keys", sa.Column("rotated_from_id", sa.Uuid(), nullable=True))
    op.create_index("ix_api_keys_rotated_from_id", "api_keys", ["rotated_from_id"])
    op.create_foreign_key(
        "fk_api_keys_rotated_from_id_api_keys",
        "api_keys",
        "api_keys",
        ["rotated_from_id"],
        ["id"],
    )

    organization_role = postgresql.ENUM(
        "OWNER",
        "ADMIN",
        "MEMBER",
        "VIEWER",
        name="organizationrole",
        create_type=False,
    )
    op.create_table(
        "organization_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("role", organization_role, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("invited_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "email",
            name="uq_organization_invitations_organization_email",
        ),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_organization_invitations_email",
        "organization_invitations",
        ["email"],
    )
    op.create_index(
        "ix_organization_invitations_invited_by_user_id",
        "organization_invitations",
        ["invited_by_user_id"],
    )
    op.create_index(
        "ix_organization_invitations_organization_id",
        "organization_invitations",
        ["organization_id"],
    )
    op.create_index(
        "ix_organization_invitations_token_hash",
        "organization_invitations",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("organization_invitations")
    op.drop_constraint("fk_api_keys_rotated_from_id_api_keys", "api_keys", type_="foreignkey")
    op.drop_index("ix_api_keys_rotated_from_id", table_name="api_keys")
    op.drop_column("api_keys", "rotated_from_id")
    op.drop_column("api_keys", "updated_at")
    op.drop_index("ix_api_keys_environment", table_name="api_keys")
    op.drop_column("api_keys", "environment")
    op.drop_index("ix_projects_archived_at", table_name="projects")
    op.drop_column("projects", "archived_at")
    op.drop_column("projects", "updated_at")
    op.drop_column("projects", "description")
    op.drop_column("organization_memberships", "updated_at")
    op.drop_index("ix_organizations_archived_at", table_name="organizations")
    op.drop_column("organizations", "archived_at")
    op.drop_column("organizations", "updated_at")
    op.drop_column("organizations", "description")
