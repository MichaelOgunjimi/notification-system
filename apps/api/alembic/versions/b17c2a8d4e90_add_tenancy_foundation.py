"""add tenancy foundation

Revision ID: b17c2a8d4e90
Revises: dbd2fccd9108
Create Date: 2026-08-27 10:25:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "b17c2a8d4e90"
down_revision: str | None = "dbd2fccd9108"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    organization_role = sa.Enum(
        "OWNER",
        "ADMIN",
        "MEMBER",
        "VIEWER",
        name="organizationrole",
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sqlmodel.sql.sqltypes.AutoString(length=320), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_is_active"), "users", ["is_active"], unique=False)

    op.create_table(
        "email_addresses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("email", sqlmodel.sql.sqltypes.AutoString(length=320), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("email = lower(email)", name="ck_email_addresses_normalized"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_email_addresses_email"),
        "email_addresses",
        ["email"],
        unique=True,
    )
    op.create_index(
        op.f("ix_email_addresses_user_id"),
        "email_addresses",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "uq_email_addresses_primary_per_user",
        "email_addresses",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
    )

    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column(
            "provider_account_id",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=False,
        ),
        sa.Column(
            "provider_email",
            sqlmodel.sql.sqltypes.AutoString(length=320),
            nullable=True,
        ),
        sa.Column(
            "provider_name",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column(
            "provider_username",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column("avatar_url", sqlmodel.sql.sqltypes.AutoString(length=2048), nullable=True),
        sa.Column("email_conflict_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider",
            "provider_account_id",
            name="uq_oauth_accounts_provider_identity",
        ),
        sa.UniqueConstraint(
            "user_id",
            "provider",
            name="uq_oauth_accounts_user_provider",
        ),
    )
    op.create_index(
        op.f("ix_oauth_accounts_email_conflict_at"),
        "oauth_accounts",
        ["email_conflict_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_oauth_accounts_provider"),
        "oauth_accounts",
        ["provider"],
        unique=False,
    )
    op.create_index(
        op.f("ix_oauth_accounts_user_id"),
        "oauth_accounts",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("jti", sqlmodel.sql.sqltypes.AutoString(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refresh_tokens_jti"), "refresh_tokens", ["jti"], unique=True)
    op.create_index(
        op.f("ix_refresh_tokens_revoked_at"),
        "refresh_tokens",
        ["revoked_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_refresh_tokens_user_id"),
        "refresh_tokens",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("slug", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_organizations_created_by_user_id"),
        "organizations",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_organizations_slug"), "organizations", ["slug"], unique=True)

    op.create_table(
        "organization_memberships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", organization_role, nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "user_id",
            name="uq_organization_memberships_organization_user",
        ),
    )
    op.create_index(
        op.f("ix_organization_memberships_organization_id"),
        "organization_memberships",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_organization_memberships_user_id"),
        "organization_memberships",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("slug", sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "slug",
            name="uq_projects_organization_slug",
        ),
    )
    op.create_index(
        op.f("ix_projects_created_by_user_id"),
        "projects",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_projects_organization_id"),
        "projects",
        ["organization_id"],
        unique=False,
    )

    op.add_column("api_keys", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.add_column("api_keys", sa.Column("created_by_user_id", sa.Uuid(), nullable=True))
    op.add_column(
        "api_keys",
        sa.Column(
            "scopes",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_api_keys_project_id"), "api_keys", ["project_id"], unique=False)
    op.create_index(
        op.f("ix_api_keys_created_by_user_id"),
        "api_keys",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_api_keys_project_id_projects",
        "api_keys",
        "projects",
        ["project_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_api_keys_created_by_user_id_users",
        "api_keys",
        "users",
        ["created_by_user_id"],
        ["id"],
    )

    op.add_column("audit_logs", sa.Column("organization_id", sa.Uuid(), nullable=True))
    op.add_column("audit_logs", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.add_column("audit_logs", sa.Column("actor_user_id", sa.Uuid(), nullable=True))
    op.create_index(
        op.f("ix_audit_logs_organization_id"),
        "audit_logs",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_audit_logs_project_id"),
        "audit_logs",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_audit_logs_actor_user_id"),
        "audit_logs",
        ["actor_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_audit_logs_organization_id_organizations",
        "audit_logs",
        "organizations",
        ["organization_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_audit_logs_project_id_projects",
        "audit_logs",
        "projects",
        ["project_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_audit_logs_actor_user_id_users",
        "audit_logs",
        "users",
        ["actor_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_audit_logs_actor_user_id_users", "audit_logs", type_="foreignkey"
    )
    op.drop_constraint("fk_audit_logs_project_id_projects", "audit_logs", type_="foreignkey")
    op.drop_constraint(
        "fk_audit_logs_organization_id_organizations", "audit_logs", type_="foreignkey"
    )
    op.drop_index(op.f("ix_audit_logs_actor_user_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_project_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_organization_id"), table_name="audit_logs")
    op.drop_column("audit_logs", "actor_user_id")
    op.drop_column("audit_logs", "project_id")
    op.drop_column("audit_logs", "organization_id")

    op.drop_constraint("fk_api_keys_created_by_user_id_users", "api_keys", type_="foreignkey")
    op.drop_constraint("fk_api_keys_project_id_projects", "api_keys", type_="foreignkey")
    op.drop_index(op.f("ix_api_keys_created_by_user_id"), table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_project_id"), table_name="api_keys")
    op.drop_column("api_keys", "created_by_user_id")
    op.drop_column("api_keys", "project_id")
    op.drop_column("api_keys", "scopes")

    op.drop_index(op.f("ix_projects_organization_id"), table_name="projects")
    op.drop_index(op.f("ix_projects_created_by_user_id"), table_name="projects")
    op.drop_table("projects")
    op.drop_index(
        op.f("ix_organization_memberships_user_id"),
        table_name="organization_memberships",
    )
    op.drop_index(
        op.f("ix_organization_memberships_organization_id"),
        table_name="organization_memberships",
    )
    op.drop_table("organization_memberships")
    op.drop_index(op.f("ix_organizations_slug"), table_name="organizations")
    op.drop_index(op.f("ix_organizations_created_by_user_id"), table_name="organizations")
    op.drop_table("organizations")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_revoked_at"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_jti"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index(op.f("ix_oauth_accounts_user_id"), table_name="oauth_accounts")
    op.drop_index(op.f("ix_oauth_accounts_provider"), table_name="oauth_accounts")
    op.drop_index(op.f("ix_oauth_accounts_email_conflict_at"), table_name="oauth_accounts")
    op.drop_table("oauth_accounts")
    op.drop_index(
        "uq_email_addresses_primary_per_user",
        table_name="email_addresses",
        postgresql_where=sa.text("is_primary"),
    )
    op.drop_index(op.f("ix_email_addresses_user_id"), table_name="email_addresses")
    op.drop_index(op.f("ix_email_addresses_email"), table_name="email_addresses")
    op.drop_table("email_addresses")
    op.drop_index(op.f("ix_users_is_active"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
    sa.Enum(name="organizationrole").drop(op.get_bind(), checkfirst=True)
