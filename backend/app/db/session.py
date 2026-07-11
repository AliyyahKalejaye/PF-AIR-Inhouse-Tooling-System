"""Async SQLAlchemy engine/session setup.

Phase 2 will add the actual models (users, components, projects, etc.) and
Alembic migrations. For now this just proves the connection wiring end to
end via the /health/db endpoint.

DATABASE_URL points at Supabase's transaction-mode pooler (PgBouncer on
port 6543), not directly at Postgres. PgBouncer in transaction-pooling
mode hands out a different underlying server connection per transaction,
so asyncpg's default behavior of caching named prepared statements
("__asyncpg_stmt_1__", ...) can collide with a stale prepared statement of
the same name left over on a connection PgBouncer reused for someone
else — raising DuplicatePreparedStatementError intermittently under any
concurrent load. `statement_cache_size=0` disables asyncpg's client-side
prepared-statement cache so every query is sent unprepared instead, which
is the documented fix for asyncpg + PgBouncer transaction pooling.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=False,
    connect_args={"statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
