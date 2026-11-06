# PF-AIR MCP Server (Phase 1 — local, read-only)

An MCP (Model Context Protocol) server that lets an AI client (Claude
Desktop) query real PF-AIR data — component stock, project/MIL status,
BOM checks, and Engineering Change Requests — through the same REST API
the frontend uses. It doesn't talk to the database directly, so PF-AIR's
existing auth, validation and permissions apply exactly as they do for any
other client.

This is a separate service from `backend/` — nothing there was touched to
build this.

**Phase 1 is read-only.** All 8 tools below are `GET`-style lookups (plus
one spreadsheet-check POST). Nothing here creates, edits, approves,
rejects, or deletes anything in PF-AIR. Write tools (`reserve_bom`,
`draft_ecr`) with preview-then-confirm guardrails are planned for Phase 2;
approve/reject/implement on ECRs stay human-only and will never be
exposed as a tool.

## Tools

| Tool | Wraps | What it's for |
|---|---|---|
| `search_components` | `GET /components`, `GET /categories` | Search inventory by name/SKU/brand/type/description and/or category, with stock levels. |
| `get_component` | `GET /components/{id}` | Full detail for one component. |
| `check_bom` | `POST /bom/check` | Upload a BOM spreadsheet, see what's available/low/missing. **One-off file check** — see note below. |
| `list_projects` | `GET /projects` | List projects, with an optional title search (client-side — the API itself only filters by status). |
| `get_project` | `GET /projects/{id}` | A project's write-up and MIL (Minimum Item List) with each part's current stock. |
| `check_project_shortfall` | `GET /projects/{id}` | **What's short for a given project's build**, computed from its MIL vs. current stock. |
| `list_ecrs` | `GET /ecr` | List Engineering Change Requests, optionally by status. |
| `get_ecr` | `GET /ecr/{id}`, `GET /ecr/{id}/comments` | Full ECR detail including its discussion thread. |

**`check_bom` vs. `check_project_shortfall`** — these answer different
questions and it's easy to reach for the wrong one. PF-AIR has no concept
of "the BOM for project X": `BOM` rows aren't linked to a `Project` at
all, and `POST /bom/check` only ever checks a spreadsheet file you upload
at that moment (same as the web app's "Check BOM" feature). What a
project actually needs lives in its **MIL** (`GET /projects/{id}`'s
`mil_items`) — real inventory rows linked by id, each with a quantity
required. So:

- "What's short for the ZD550 build?" → `list_projects(title_contains="ZD550")`
  to get its id, then `check_project_shortfall(project_id=...)`.
- "I have this BOM spreadsheet, what's missing?" → `check_bom(...)` with
  the file's bytes.

## Setup

Requires Python 3.11+ and [`uv`](https://docs.astral.sh/uv/) (already used
for `backend/`).

```bash
cd mcp
cp .env.example .env
uv sync
```

### Create the service account

This server authenticates as a dedicated PF-AIR user over the same
`POST /auth/login` every other client uses — it's not a special account
type, just a regular signup that happens to be used by a service instead
of a person. Any account works; none of the Phase 1 routes require the
`admin` role.

With the backend running locally (`http://localhost:8000` by default),
create one:

```bash
curl -X POST http://localhost:8000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MCP Service Account",
    "email": "mcp-service@proforcedefence.com",
    "staff_id": "MCP-SVC-01",
    "password": "choose-a-strong-password-here"
  }'
```

Pick a `staff_id` that won't collide with a real person's (anything
unused works — `staff_id` just has to be unique). Then fill in `mcp/.env`:

```bash
PFAIR_BASE_URL=http://localhost:8000
PFAIR_API_PREFIX=/api/v1
PFAIR_SERVICE_EMAIL=mcp-service@proforcedefence.com
PFAIR_SERVICE_PASSWORD=choose-a-strong-password-here
PFAIR_LOG_FILE=./logs/tool_calls.log
```

**Never commit `.env`** — `mcp/.gitignore` already excludes it (and
`mcp/logs/`), same idea as `backend/.gitignore`'s own `.env` exclusion.

### Try it standalone (optional, before wiring up Claude Desktop)

The [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
lets you call tools by hand and see raw results, without Claude Desktop:

```bash
uv run --with "mcp[cli]" mcp dev src/pfair_mcp/server.py
```

This opens a local web UI where you can pick a tool (e.g.
`check_project_shortfall`), fill in its arguments, and run it against
whatever backend `PFAIR_BASE_URL` points at.

## Connect it to Claude Desktop

Open your Claude Desktop config file:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add an entry under `mcpServers` (merge with whatever's already there —
don't replace the whole file if other servers are configured):

```json
{
  "mcpServers": {
    "pfair-tooling": {
      "command": "uv",
      "args": [
        "--directory",
        "C:\\Users\\MB\\OneDrive\\Documents\\PROFORCE\\Inhouse Tooling\\proforce-tooling\\proforce-tooling\\mcp",
        "run",
        "pfair-mcp"
      ]
    }
  }
}
```

Replace the path in `args` with this repo's actual `mcp/` folder on your
machine (on Windows, use double backslashes in JSON as shown, or forward
slashes — both work). `--directory` is what makes `uv` run from inside
`mcp/`, which is what lets `pfair_mcp`'s settings find `.env` sitting next
to `pyproject.toml` — the service account credentials never need to go in
this config file.

Quit and reopen Claude Desktop completely (not just close the window) for
it to pick up the new server. Once it's running, Claude Desktop shows a
small tools/plug icon in the chat input — click it to confirm
`pfair-tooling`'s 8 tools are listed.

### First test

Ask Claude: **"What are we short for the ZD550 build?"**

Expect it to call `list_projects` (to find the ZD550 project's id, likely
with `title_contains="ZD550"`), then `check_project_shortfall` with that
id, and answer from the real shortage numbers. If it instead reaches for
`check_bom`, that's a sign the tool descriptions need sharpening rather
than anything wrong with your data — see the note on the two tools above.

## Logs

Every tool call writes one JSON line to `PFAIR_LOG_FILE` (`./logs/`
relative to `mcp/` by default, gitignored): tool name, inputs (long values
like `check_bom`'s file content are truncated), success/failure, and
duration in milliseconds. Example line:

```json
{"timestamp": "2026-11-06T10:00:00+00:00", "tool": "check_project_shortfall", "inputs": {"project_id": "..."}, "success": true, "duration_ms": 42.3}
```

This is a flat file for now — Phase 3 moves the same fields into a real
audit-log table without changing how tool code calls into logging.

## Running the tests

Tests run entirely against a mocked HTTP layer (`respx`) — no live backend
needed, matching the mocking style `backend/tests/` already uses at its
own boundaries.

```bash
cd mcp
uv run pytest
uv run ruff check .
uv run mypy src
```

## Troubleshooting

- **"No PF-AIR service account configured"** — `.env` is missing or
  `PFAIR_SERVICE_EMAIL`/`PFAIR_SERVICE_PASSWORD` are blank. Check the file
  is actually named `.env` (not `.env.example`) and sits in `mcp/`.
- **"Couldn't reach the PF-AIR backend"** — the backend isn't running, or
  `PFAIR_BASE_URL`/`PFAIR_API_PREFIX` don't match where it's actually
  listening. Confirm `curl http://localhost:8000/api/v1/health` works
  first.
- **"PF-AIR returned an error: Incorrect email or password."** — the
  service account's credentials in `.env` don't match what you signed up
  with; re-run the signup `curl` command or double-check for typos.
- **Claude Desktop doesn't show the `pfair-tooling` tools at all** — this
  is almost always the config file: invalid JSON (a trailing comma, an
  unescaped backslash on Windows) silently stops Claude Desktop from
  loading *any* server. Validate the file's JSON, and fully quit/reopen
  the app after editing it.
