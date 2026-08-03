# PF-AIR-Inhouse-Tooling-System

The in-house engineering tooling platform for Proforce Airsystems. One login,
one unified backend, one shared data layer — Inventory Management and
Projects Progress Report ship first, with the same shell built to take on
more tools later (Engineering Change Requests, etc.) without a rewrite.

See `/docs` in the team's Inhouse Tooling folder for the approved screen
mockups (18 screens) and the system architecture diagram this repo
implements.

## Stack

| Layer | Choice | Hosting |
|---|---|---|
| Frontend | Next.js (TypeScript, Tailwind) | Cloudflare Pages |
| Backend | FastAPI (Python) | Render |
| Database | PostgreSQL + pgvector (HNSW search) | Supabase |
| Object storage | S3-compatible | Cloudflare R2 |
| Cache / job queue | Redis | Upstash |
| CI/CD | GitHub Actions | — |

Full rationale for these choices (including why each has a workable free
tier) was covered earlier in the project chat — this table is just the
reference copy.

## Repo layout

```
backend/    FastAPI app (app/), Alembic migrations (alembic/), tests/
frontend/   Next.js app (src/app/), shared components (src/components/)
docker-compose.yml   local dev: Postgres+pgvector, Redis, backend, frontend
.github/workflows/   CI (lint/typecheck/test) + deploy (Pages + Render)
```

## Running locally

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000/docs
- Backend health check: http://localhost:8000/api/v1/health/db (confirms the DB connection)

## Manual setup — things only you can do

I can write and commit all the code, but creating accounts and entering
credentials isn't something I do on your behalf. Before Phase 1's CI/CD can
actually deploy anywhere, someone on your side needs to:

1. **Create a GitHub repo** and push this project to it (I'll do the `git
   push` once you tell me the repo URL — I just can't create the GitHub
   repo itself without your account).
2. **Cloudflare Pages**: create a project named `proforce-tooling`, connect
   it to the repo (or leave it disconnected and let the GitHub Action
   publish to it). Generate an API token (Account > API Tokens > "Edit
   Cloudflare Pages" template) and note your Account ID.
3. **Render**: create a new Web Service pointed at `backend/`, using
   `backend/Dockerfile`. Once created, copy its Deploy Hook URL (Settings >
   Deploy Hook).
4. **Supabase**: create a project, enable the `vector` extension (Database >
   Extensions), copy the connection string (Settings > Database > Connection
   string > URI — swap `postgresql://` for `postgresql+asyncpg://`).
5. **Cloudflare R2**: create a bucket named `proforce-tooling`, generate an
   API token with R2 read/write access.
6. **Upstash**: create a Redis database, copy the connection URL.
7. **Add these as GitHub repo secrets** (Settings > Secrets and variables >
   Actions): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `RENDER_DEPLOY_HOOK_URL`. The backend's own env vars (`DATABASE_URL`,
   `REDIS_URL`, `JWT_SECRET`, `R2_*`) get set directly in the Render
   dashboard, not in GitHub — Render is where the app actually runs.

Once those exist, every merge to `main` auto-deploys both sides. Until then,
CI (lint/typecheck/test) still runs on every PR — that part needs nothing
from you.

## A note on this sandbox

I built and reviewed this scaffold in a cloud sandbox whose network policy
only allows a short allowlist of hosts (github.com among them) — PyPI and
the npm registry both return 403 here, so I could not run `uv sync` /
`npm install` to fully verify the install here. Everything is written by
hand with pinned, known-good dependency versions, and CI will do a real
install/build/test on GitHub's runners (which have normal internet access)
on the very first PR — that's the actual verification step, and Phase 1
isn't done until that first CI run is green.

## Phase checklist

This repo is being built phase by phase — see the task list in this
session for the full 10-phase plan. Phase 1 (this commit) is scaffolding
only: no real endpoints, no database schema, no auth yet. That starts in
Phase 2.

## Adding a new tool

See [`docs/adding-a-new-tool.md`](docs/adding-a-new-tool.md) — the backend
model → schema → service → route pattern and frontend page → component →
lib-client pattern every existing tool (Inventory, Projects) follows, plus
the gotchas worth knowing before you hit them.
