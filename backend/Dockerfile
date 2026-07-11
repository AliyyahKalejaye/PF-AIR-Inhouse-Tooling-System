# Render builds and runs this image for the backend service.
FROM python:3.11-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

COPY . .
RUN uv sync --no-dev

EXPOSE 8000
# Run pending Alembic migrations before every boot, not just the first one —
# this is the only place migrations get applied against Supabase (there's
# no separate release step on Render), so every future phase's schema
# changes land automatically on the next deploy instead of silently
# never running. If a migration fails, the container fails to start
# rather than serving against a stale/incomplete schema.
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
