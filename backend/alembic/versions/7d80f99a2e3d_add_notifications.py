"""add notifications

Revision ID: 7d80f99a2e3d
Revises: e37ac3dbc197
Create Date: 2026-08-03

Adds the notifications feature: a shared/broadcast `notifications` feed
(no per-user ownership model exists elsewhere in the app — no "my
projects", no assigned components — so there's no natural per-user
target for these events) plus `notification_receipts`, a per-user
read-state join table. Existence of a receipt row means "this user has
read this notification"; there's no `is_read` column on `notifications`
itself since one notification has many readers.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7d80f99a2e3d"
down_revision: str | None = "e37ac3dbc197"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("link", sa.String(500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])

    op.create_table(
        "notification_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "notification_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("notifications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_unique_constraint(
        "uq_notification_user_read",
        "notification_receipts",
        ["notification_id", "user_id"],
    )
    op.create_index(
        "ix_notification_receipts_user_id", "notification_receipts", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_notification_receipts_user_id", table_name="notification_receipts")
    op.drop_constraint(
        "uq_notification_user_read", "notification_receipts", type_="unique"
    )
    op.drop_table("notification_receipts")
    op.drop_index("ix_notifications_created_at", table_name="notifications")
    op.drop_table("notifications")
