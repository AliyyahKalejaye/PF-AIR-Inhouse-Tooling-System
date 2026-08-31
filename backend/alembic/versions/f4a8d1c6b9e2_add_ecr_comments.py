"""add ecr comments

Revision ID: f4a8d1c6b9e2
Revises: e3f9a2c7d5b1
Create Date: 2026-08-31

Adds `ecr_comments` — a discussion trail under each Engineering Change
Request. Posting a comment also notifies whichever of {assigned_approver,
requester} isn't the comment's own author (see notify_ecr_commented in
app/services/notifications.py), so the thread doubles as a way to nudge a
request that's been sitting without a decision, not just a log.

RLS enabled with no policies in this same migration, same reasoning as
c1a7f0e9b3d4_add_engineering_change_requests.py's docstring: nothing
reaches these tables except through the backend's own `postgres`-role
connection, which RLS doesn't restrict.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f4a8d1c6b9e2"
down_revision: str | None = "e3f9a2c7d5b1"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ecr_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "ecr_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("engineering_change_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    # Every comment fetch is "all comments for this one ECR" — see
    # list_ecr_comments in api/routes/ecr.py.
    op.create_index("ix_ecr_comments_ecr_id", "ecr_comments", ["ecr_id"])
    op.execute("ALTER TABLE public.ecr_comments ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index("ix_ecr_comments_ecr_id", table_name="ecr_comments")
    op.drop_table("ecr_comments")
