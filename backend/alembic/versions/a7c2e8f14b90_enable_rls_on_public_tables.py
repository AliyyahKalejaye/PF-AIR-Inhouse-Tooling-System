"""enable row level security on all public tables

Revision ID: a7c2e8f14b90
Revises: f3a91c4b7d2e
Create Date: 2026-08-07

Supabase's dashboard flags every public-schema table with RLS disabled as
a security warning, because Supabase auto-exposes the entire `public`
schema over a REST API (PostgREST) using an `anon` API key by default —
RLS is what's supposed to gate what that key (and a signed-in
`authenticated` role) can see. This app never uses that API or those
Supabase roles at all: the backend talks to Postgres directly over
asyncpg using the `postgres` connection role from DATABASE_URL, with its
own JWT-based auth layer entirely separate from Supabase Auth. But the
warning is still real — if the Supabase anon key is ever exposed (it's
not currently used anywhere in this codebase, but it exists on every
Supabase project by default), these tables would be readable/writable by
anyone who has it, with no RLS in the way.

Enabling RLS with zero policies makes every table default-deny for any
role subject to RLS (Supabase's `anon`/`authenticated` roles included) —
exactly what we want, since nothing should be reaching these tables
except through this backend. It does NOT affect the backend itself:
Postgres exempts the table owner from its own RLS policies unless
`FORCE ROW LEVEL SECURITY` is also set (which this migration does not
set), and the `postgres` role in DATABASE_URL is the owner of every table
here, having created them via earlier migrations. So this closes the
Supabase Advisor warnings with no behavior change for the app.

alembic_version itself is included too — it's a public-schema table like
any other and shows up in the same Advisor scan.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7c2e8f14b90"
down_revision: str | None = "f3a91c4b7d2e"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

TABLES = [
    "users",
    "categories",
    "components",
    "boms",
    "bom_items",
    "projects",
    "project_media",
    "mil_items",
    "notifications",
    "notification_receipts",
    "alembic_version",
]


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY")
