# Adding a new tool

This app is built as one shared shell (auth, Tool Hub, Topbar, FootNav)
around independent "tools" — Inventory Management shipped in Phase 5,
Projects Progress Report in Phase 7, and Engineering Change Requests is the
next one sitting in the Tool Hub as "Coming soon." This doc is the recipe
for turning a fourth (or fifth, or tenth) tool from "Coming soon" into
"Live," written from how the first two were actually built.

Nothing here is a hard rule enforced by the framework — it's the pattern
every existing tool follows, so a new one that follows it too will read as
"the same app" instead of a bolted-on side project. Deviate where the tool
genuinely needs to; just do it on purpose.

## The mental model

A tool is:

- One or more **database tables** it owns (its own models, not shared ones
  — Inventory owns `components`/`categories`, Projects owns
  `projects`/`project_media`/`mil_items`, and they *reference* each other
  by id rather than merging schemas).
- A **FastAPI router** exposing that tool's endpoints under
  `/api/v1/<tool>`.
- One or more **Next.js pages** under `src/app/<tool>/`, reachable from a
  Tool Hub card.
- A **frontend API client module** (`src/lib/<tool>.ts`) other tools never
  import from directly — cross-tool data flows through the backend (e.g.
  Projects' MIL items reference `Component` by id via the backend, not by
  a frontend import of Inventory's client code).

Everyone shares: `User`/auth, the `Topbar`/`FootNav` chrome, the
`ProtectedRoute` wrapper, and `lib/api.ts`'s fetch helpers
(`apiGet`/`apiPost`/`apiPatch`/`apiDelete`/`apiPostFile`).

## Backend

Work through these in order — each layer depends on the one before it.

### 1. Models — `app/models/<tool>.py`

A SQLAlchemy model per table, inheriting the two mixins every table gets:

```python
from app.db.base import Base, TimestampMixin, UUIDPkMixin

class Widget(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "widgets"
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    ...
```

`UUIDPkMixin` gives you a UUID `id`; `TimestampMixin` gives you
`created_at`/`updated_at`. Then register the new model(s) in
`app/models/__init__.py`'s import list — Alembic's autogenerate (and
anyone reading that file to see "what tables exist") relies on it being
complete.

### 2. Migration

```bash
cd backend
uv run alembic revision --autogenerate -m "add widgets table"
```

Read the generated migration before running it — autogenerate is good but
not infallible (it won't always get server-side defaults or check
constraints right). Apply locally with `uv run alembic upgrade head`.

### 3. Schemas — `app/schemas/<tool>.py`

Pydantic request/response models. The established split:

- `WidgetCreate` / `WidgetUpdate` — request bodies. `Update` schemas make
  every field optional (`field: str | None = None`) since routes use
  `payload.model_dump(exclude_unset=True)` for partial updates.
- `WidgetRead` — response body, `model_config = ConfigDict(from_attributes=True)`
  so it can be built straight from the ORM object.
- Add `Field(min_length=..., max_length=..., ge=...)` constraints on every
  string/int input — see `app/schemas/inventory.py` or
  `app/schemas/project.py` for the actual bounds used elsewhere. This is
  the app's only input-validation layer; don't skip it because "the
  frontend already validates."

### 4. Service layer — `app/services/<tool>.py` (when there's real logic)

Anything beyond plain CRUD (matching/parsing/computation) goes in a
service module, not the route file — `bom_matcher.py`, `bulk_import.py`,
`document_parser.py` are the examples. This is also what makes the logic
unit-testable without spinning up the DB (see Testing, below).

### 5. Routes — `app/api/routes/<tool>.py`

```python
router = APIRouter(prefix="/widgets", tags=["widgets"])

@router.get("", response_model=list[WidgetRead])
async def list_widgets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Widget]:
    ...
```

`Depends(get_current_user)` on every route unless the tool genuinely needs
an unauthenticated endpoint (health checks are the only current exception —
and if you add a public endpoint that's a plausible abuse target, like
auth's login/signup, wire it through `app.core.rate_limit.rate_limiter`,
see `app/api/routes/auth.py` for the pattern). Raise `HTTPException` with
the real status code (404 not-found, 409 conflict, 400 bad input) rather
than letting things fall through to a generic 500 — the global exception
handler in `app/main.py` only exists as the last-resort catch, not the
first line of error handling.

### 6. Wire it in — `app/main.py`

```python
from app.api.routes import ..., widgets
...
app.include_router(widgets.router, prefix=settings.api_prefix)
```

### 7. Tests — `backend/tests/test_<tool>*.py`

Two kinds, both expected for a new tool per Phase 9's coverage bar:

- **Route tests** using the `client`/`auth_headers` fixtures from
  `tests/conftest.py` — see `tests/test_components.py` or
  `tests/test_projects.py` for the shape (create → read → update →
  delete, a 404 case, a conflict case, an auth-required case).
- **Service unit tests** for anything in `app/services/<tool>.py` that
  doesn't need a DB session — see `tests/test_bom_matcher.py`. These run
  fast and don't need Postgres reachable at all.

## Frontend

### 1. API client — `src/lib/<tool>.ts`

One module, mirroring `src/lib/inventory.ts` / `src/lib/projects.ts`:
TypeScript interfaces matching the backend's `*Read` schemas, plus thin
wrapper functions around `apiGet`/`apiPost`/etc. from `lib/api.ts`. Pages
never call `fetch()` directly — always through this module, so error
handling (`ApiError`) is consistent everywhere.

### 2. Pages — `src/app/<tool>/`

Every data-fetching page follows the same three-state shape (see
`src/app/inventory/page.tsx` for the fullest example):

```tsx
const [loading, setLoading] = useState(true);
const [loadError, setLoadError] = useState<string | null>(null);
// ...fetch in useEffect, setLoading(false) in .finally()...

if (loading) return <Loading />;
if (loadError) return <ErrorBanner message={loadError} />;
if (items.length === 0) return <EmptyState />;
return <RealContent />;
```

Wrap the page's default export in `<ProtectedRoute>` (see any existing
page's bottom few lines) unless it's meant to be reachable without
logging in.

### 3. Components — `src/components/<tool>/`

Modals, drawers, and anything reused across the tool's own pages. Shared
cross-tool components (`Topbar`, `FootNav`, `ProtectedRoute`) live one
level up in `src/components/` directly — don't duplicate them per-tool.

### 4. Tool Hub card — `src/app/hub/page.tsx`

Add a `<ToolCard>` with `tag="Live"` and `href="/<tool>"`, matching the
two existing live cards. Flip an existing `soon` placeholder card to live
rather than adding a third if the tool already has one there (Engineering
Change Requests already has its card reserved).

### 5. Frontend tests — `src/lib/<tool>.test.ts`

Per Phase 9's Vitest setup (`vitest.config.ts`): unit-test any pure
logic in the new `lib/<tool>.ts` module the same way
`lib/github.test.ts` covers `parseGitHubUrl`/`buildFileTree`. A component
smoke test isn't mandatory for every component, but is a easy, low-risk
one to add for anything with no auth/context dependency, following
`DarkViewerTopBar.test.tsx`.

## Conventions worth knowing before you hit them

- **`noUncheckedIndexedAccess` narrowing doesn't survive re-reads.** If
  you narrow `foo.bar` or `arr[i]` with an `if` check, then read the same
  expression again later (especially across a closure boundary — an
  event handler, a `.map()` callback), TypeScript won't remember the
  narrowing and you'll get a stale `T | undefined` error. Fix: bind the
  narrowed value to a local `const` once, use only that local afterward.
  This bit `MediaAttachments.tsx`, `github.ts`, and `code-highlight.ts` —
  see any of their comments for the concrete before/after.
- **New dependencies are a bigger deal here than usual.** Whoever's
  writing this code (human or Claude, in a sandbox with no npm/PyPI
  registry access) can't locally verify a new package actually installs
  or that its types match what's assumed — the very first real check is
  the CI run on GitHub's runners. The `@types/three` miss in Phase 8 (an
  incorrect assumption that three.js shipped its own types) is the
  cautionary tale. Prefer what's already a dependency; if you must add
  one, expect to iterate once against a real CI failure.
- **Every list/detail fetch gets all three states** (loading/error/empty)
  — see Phase 9, which went back and added the ones that were missing.
  Don't ship a fetch with just the happy path.
- **Don't add a new subdomain of trust silently.** If the tool needs a
  new external API call (like the Code Viewer's live GitHub API calls) or
  a new unauthenticated route, say so explicitly in a comment at the call
  site — future readers (and future you) need to know what's reaching out
  to the internet and why.
- **Every page needs to actually work at a phone width, not just look
  okay in a desktop browser.** The mockups are desktop-only, but the app
  is used from phones in practice — Phase 10 QA found real breakage
  (fixed pixel-width sidebars, 4/5-column grids, `useParams()` returning
  stale build-time values in the static export) that only showed up once
  someone opened it on a phone. Concretely: never give a container a bare
  fixed width like `w-[320px]` — use `w-full lg:w-[320px] lg:shrink-0` (or
  similar) so it collapses instead of forcing horizontal scroll; stack
  multi-column `flex`/`grid` layouts under a breakpoint
  (`flex-col lg:flex-row`, `grid-cols-2 lg:grid-cols-4`); wrap any data
  table in `<div className="overflow-x-auto">` rather than letting it
  squish; and check header rows with several buttons (`flex items-center
  justify-between`) — they're the most common overflow source, and
  usually just need `flex-col gap-3 sm:flex-row sm:items-center
  sm:justify-between`. Actually resize a browser (or use dev tools' device
  toolbar) to ~375px wide before calling a new page done.

## Checklist

- [ ] Model(s) in `app/models/`, registered in `app/models/__init__.py`
- [ ] Migration generated and reviewed
- [ ] Schemas in `app/schemas/` with real `Field` constraints
- [ ] Service layer for any non-trivial logic
- [ ] Routes in `app/api/routes/`, registered in `app/main.py`
- [ ] Backend route tests + service unit tests
- [ ] Frontend API client in `src/lib/`
- [ ] Pages with loading/error/empty states, wrapped in `ProtectedRoute`
- [ ] Tool Hub card flipped to `Live`
- [ ] Frontend unit/smoke tests for new `lib/` logic
- [ ] Checked at ~375px viewport width — no fixed-width overflow, no
      squished tables, header/action rows stack instead of clipping
- [ ] `npm run typecheck && npm test && npm run build` and
      `uv run ruff check . && uv run mypy app && uv run pytest` both clean
