"""ecr priority

Revision ID: e3f9a2c7d5b1
Revises: d2b8e6a1f4c7
Create Date: 2026-08-31

Adds `engineering_change_requests.priority` (low/medium/high/urgent,
default medium) — part of the "fully optimal" round: lets the list page
sort/surface the requests that actually need attention first, instead of
every submitted request looking equally urgent.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e3f9a2c7d5b1"
down_revision: str | None = "d2b8e6a1f4c7"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "engineering_change_requests",
        sa.Column(
            "priority",
            sa.String(20),
            nullable=False,
            server_default="medium",
        ),
    )
    # Drop the server_default once existing rows are backfilled — the ORM
    # always supplies a value going forward (see ECRCreate.priority), same
    # pattern as status's own column.
    op.alter_column("engineering_change_requests", "priority", server_default=None)


def downgrade() -> None:
    op.drop_column("engineering_change_requests", "priority")
