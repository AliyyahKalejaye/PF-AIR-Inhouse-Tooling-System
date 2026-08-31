"""add engineering change requests

Revision ID: c1a7f0e9b3d4
Revises: a7c2e8f14b90
Create Date: 2026-08-31

Adds the `engineering_change_requests` table backing the ECR tool (Tool
Hub's third card, previously "Coming soon"). Single-admin review, not a
multi-department chain — see app/models/ecr.py's module docstring for why.

RLS is enabled with no policies immediately, in the same migration that
creates the table, rather than left for a follow-up like
a7c2e8f14b90_enable_rls_on_public_tables.py had to do — see that
migration's docstring for why RLS-with-zero-policies is the right default
for every public-schema table in this app (nothing reaches these tables
except through the backend's own `postgres`-role connection, which RLS
doesn't restrict).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c1a7f0e9b3d4"
down_revision: str | None = "a7c2e8f14b90"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "engineering_change_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="submitted"),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "component_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("components.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "requested_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_engineering_change_requests_status", "engineering_change_requests", ["status"]
    )
    op.create_index(
        "ix_engineering_change_requests_created_at",
        "engineering_change_requests",
        ["created_at"],
    )
    op.execute("ALTER TABLE public.engineering_change_requests ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index(
        "ix_engineering_change_requests_created_at", table_name="engineering_change_requests"
    )
    op.drop_index(
        "ix_engineering_change_requests_status", table_name="engineering_change_requests"
    )
    op.drop_table("engineering_change_requests")
