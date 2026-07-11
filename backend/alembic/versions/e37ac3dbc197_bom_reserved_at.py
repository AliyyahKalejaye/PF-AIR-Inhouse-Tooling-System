"""add boms.reserved_at

Revision ID: e37ac3dbc197
Revises: d5ea27255215
Create Date: 2026-07-11

Guards BOM reservation against double-application — Phase 4's
POST /bom/{id}/reserve endpoint sets this the first time it succeeds and
refuses to run again for the same BOM, so a retried request (or an
accidental double-click) can't decrement inventory quantities twice.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e37ac3dbc197"
down_revision: str | None = "d5ea27255215"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("boms", sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("boms", "reserved_at")
