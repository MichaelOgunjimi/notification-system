"""merge email sender and org-wide alert rules heads

Revision ID: e9b2d4f6a038
Revises: a8d3c5e1b947, d8e1f4a7c250
Create Date: 2026-10-02 00:00:00.000000
"""

from collections.abc import Sequence

revision: str = "e9b2d4f6a038"
down_revision: str | Sequence[str] | None = ("a8d3c5e1b947", "d8e1f4a7c250")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Join the two migration branches; no schema change."""


def downgrade() -> None:
    """Split the branches again; no schema change."""
