"""add thumbnail_url to project_media

Revision ID: f3a91c4b7d2e
Revises: 7d80f99a2e3d
Create Date: 2026-08-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a91c4b7d2e"
down_revision: str | None = "7d80f99a2e3d"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "project_media",
        sa.Column("thumbnail_url", sa.String(length=1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_media", "thumbnail_url")
