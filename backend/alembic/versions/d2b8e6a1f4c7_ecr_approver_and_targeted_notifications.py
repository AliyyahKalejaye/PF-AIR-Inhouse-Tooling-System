"""ecr assigned approver, freeform component name, targeted notifications

Revision ID: d2b8e6a1f4c7
Revises: c1a7f0e9b3d4
Create Date: 2026-08-31

Two additions to the ECR feature, both requested after the first cut
shipped:

1. `engineering_change_requests.assigned_approver_id` — who's expected to
   review a request, so the requester can tag a specific admin rather than
   just filing into a shared queue.
2. `engineering_change_requests.component_name` — a freeform fallback for
   a part that isn't in the Inventory catalog yet (the New Change Request
   form's component picker only offered existing Components, with no way
   to type one in).

`notifications.target_user_id` makes (1) actually notify that one person:
see app/models/notification.py's Notification.target_user_id docstring —
null means broadcast (the original/only behavior before this migration),
set means visible only to that user.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d2b8e6a1f4c7"
down_revision: str | None = "c1a7f0e9b3d4"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "engineering_change_requests",
        sa.Column("component_name", sa.String(300), nullable=True),
    )
    op.add_column(
        "engineering_change_requests",
        sa.Column(
            "assigned_approver_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "notifications",
        sa.Column(
            "target_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    # Every list/unread-count query filters on this column (see
    # api/routes/notifications.py's _visible_to) — worth an index given
    # notifications is the one table every authenticated request touches
    # (the topbar's unread-count poll).
    op.create_index("ix_notifications_target_user_id", "notifications", ["target_user_id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_target_user_id", table_name="notifications")
    op.drop_column("notifications", "target_user_id")
    op.drop_column("engineering_change_requests", "assigned_approver_id")
    op.drop_column("engineering_change_requests", "component_name")
