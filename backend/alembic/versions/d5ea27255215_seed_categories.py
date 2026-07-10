"""seed categories

Revision ID: d5ea27255215
Revises: 9be6eb7e1c80
Create Date: 2026-07-10

Seeds the six categories used as filter chips on the Inventory dashboard
mockup, so Phase 4/5 have real category_id values to work against instead
of everyone inventing their own on day one.
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d5ea27255215"
down_revision: str | None = "9be6eb7e1c80"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATEGORIES = [
    ("Aerospace / UAV", "aerospace-uav"),
    ("Electronics", "electronics"),
    ("Mechanical", "mechanical"),
    ("Power & Battery", "power-battery"),
    ("Sensors", "sensors"),
    ("Fasteners", "fasteners"),
]

categories_table = sa.table(
    "categories",
    sa.column("id", postgresql.UUID(as_uuid=True)),
    sa.column("name", sa.String),
    sa.column("slug", sa.String),
)


def upgrade() -> None:
    op.bulk_insert(
        categories_table,
        [{"id": uuid.uuid4(), "name": name, "slug": slug} for name, slug in CATEGORIES],
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM categories WHERE slug IN ("
        + ", ".join(f"'{slug}'" for _, slug in CATEGORIES)
        + ")"
    )
