# PF-AIR MCP Server (local, read + guarded writes)

An MCP (Model Context Protocol) server that lets an AI client (Claude
Desktop) query real PF-AIR data — component stock, project/MIL status,
BOM checks, and Engineering Change Requests — through the same REST API
the frontend uses. It doesn't talk to the database directly, so PF-AIR's
existing auth, validation and permissions apply exactly as they do for any
other client.

This is a separate service from `backend/` — nothing there was touched to
build this.

**Phase 1** added the read tools. **Phase 2** added reserving a checked
BOM's stock and submitting Engineering Change Requests. **Phase 2b** adds
working on projects (create from a document, edit, parts lists, links),
adding to inventory, and deleting projects / parts-list lines / media —
see [Write tools](#write-tools). Approving, rejecting, implementing,
editing and deleting ECRs, and deleting inventory parts, stay human-only
in the web app and are not exposed as tools.

### How attached files get in

The extension runs on each person's computer and can't see files attached
in a Claude chat. So when someone attaches a project document, BOM or
inventory spreadsheet, **Claude reads it and passes the contents to the
tools as structured data** (project fields, BOM lines, inventory rows).
Nothing depends on where anyone keeps their files. Limits: this suits
typical documents and sheets of up to a few hundred rows — for very large
imports the web app's bulk import is faster. Images and CAD files can't be
attached to a project from the chat (only links can); use the web app.

## Tools

| Tool | Wraps | What it's for |
|---|---|---|
| `search_components` | `GET /components`, `GET /categories` | Search inventory by name/SKU/brand/type/description and/or category, with stock levels. |
| `get_component` | `GET /components/{id}` | Full detail for one component. |
| `check_bom` | `POST /bom/check` | Check BOM lines (read from an attached BOM) against inventory: available/low/missing. Re-packed as a CSV upload. **One-off check** — see note below. |
| `list_projects` | `GET /projects` | List projects, with an optional title search (client-side — the API itself only filters by status). |
| `get_project` | `GET /projects/{id}` | A project's write-up and MIL (Minimum Item List) with each part's current stock. |
| `check_project_shortfall` | `GET /projects/{id}` | **What's short for a given project's build**, computed from its MIL vs. current stock. |
| `list_ecrs` | `GET /ecr` | List Engineering Change Requests, optionally by status. |
| `get_ecr` | `GET /ecr/{id}`, `GET /ecr/{id}/comments` | Full ECR detail including its discussion thread. |
| `preview_bom_reservation` | `GET /components/{id}` | Phase 2. What reserving a checked BOM would deduct, with live stock. Changes nothing; returns a confirmation code. |
| `reserve_bom` | `POST /bom/{id}/reserve` | Phase 2. **Deducts stock, no undo.** Takes only the code from the preview. |
| `preview_ecr` | `GET /projects/{id}`, `GET /components/{id}`, `GET /ecr/approvers` | Phase 2. Validates and shows a new change request and who'd be notified. Changes nothing; returns a code. |
| `submit_ecr` | `POST /ecr` | Phase 2. **Creates the request and notifies people.** Takes only the code from the preview. |
| `preview_new_project` | `GET /projects`, component lookups | Shows a new project (write-up + parts list) before creating it; flags duplicate titles and parts that don't match exactly one inventory item. Returns a code. |
| `create_project` | `POST /projects`, `POST /projects/{id}/mil-items` | **Creates the project and its parts list; notifies everyone.** Takes only the code. |
| `update_project` | `PATCH /projects/{id}` | Edit write-up fields or status (only fields passed change; `""` clears). |
| `add_parts_list_item` | `POST /projects/{id}/mil-items` | Add an inventory part to a project's parts list. |
| `set_parts_list_quantity` | `PATCH /projects/{id}/mil-items/{item_id}` | Change how many of a listed part a project needs. |
| `add_project_link` | `POST /projects/{id}/media/link` | Attach a link (e.g. a code repo) to a project. |
| `preview_inventory_import` | `GET /components`, `GET /categories` | Predicts, row by row, which parts an import creates and which existing parts gain stock (same matching rule as the backend). Returns a code. |
| `import_inventory` | `POST /bulk-import/commit` | **Creates parts / adds stock.** Takes only the code. |
| `update_component` | `PATCH /components/{id}` | Edit one inventory part; `quantity` **sets** stock (e.g. after a count). |
| `preview_delete` | `GET /projects/{id}`, `GET /ecr` | Shows what deleting a project, parts-list line or media item takes with it. Returns a code. |
| `confirm_delete` | `DELETE /projects/...` | **Deletes, no undo.** Takes only the code. |

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

## Write tools

Anything that does several things at once, or can't be undone, works the
same way: creating a project, importing inventory, reserving a BOM,
submitting a change request, and every delete.

1. A **preview** tool works out exactly what would happen and returns a
   single-use confirmation code (e.g. `ECR-3F9A1C`), valid for 10 minutes.
2. The **write** tool takes *only* that code — not the details again — so
   it can only ever do exactly what was previewed.

Single edits — `update_project`, `add_parts_list_item`,
`set_parts_list_quantity`, `add_project_link`, `update_component` — run
directly; Claude Desktop's approval prompt is the checkpoint for those.

The code proves a preview happened; it doesn't prove a person read it,
since the same AI that ran the preview could pass the code straight back.
**The real checkpoint is Claude Desktop's tool permissions**: in the
extension's settings, set every write tool (`create_project`,
`import_inventory`, `reserve_bom`, `submit_ecr`, `confirm_delete`, and the
single-edit tools) to ask for approval every time (they're annotated as write tools, `reserve_bom` and `confirm_delete` as
destructive, which clients use to decide what to ask about — but check
the setting rather than assuming). Codes live in memory only, so
restarting the server or reinstalling the extension cancels any that are
outstanding.

**Who it's recorded as.** Everything is done as the shared service
account, so PF-AIR's "requester" field shows that account. To record who
actually asked, each install sets an operator name (`PFAIR_OPERATOR_NAME`,
or "Your name" in the extension's install form): change requests get
"Submitted via Claude on behalf of <name>" appended to their description,
and every write is logged with the operator and its result. The write
tools refuse to run while no operator name is set. One consequence of the
shared account: a request submitted this way can't be edited or withdrawn
by the person who asked from their own web-app login (only the requester
or an admin can) — ask an admin, or submit from the web app instead if
you'll want to edit it.

### Projects

- A parts-list line has to point at a real inventory part, matched by id
  or exact name (case, spaces and punctuation ignored, like the backend's
  bulk import). Anything looser lists the candidates instead of guessing —
  e.g. "M3" when inventory has M3x10 and M3x12 screws. Parts not in
  inventory yet need adding first (`preview_inventory_import`).
- Each part can only be on a project's list once; repeats in one request
  are merged, and `add_parts_list_item` on a listed part tells you to use
  `set_parts_list_quantity` instead.
- New projects get "Created via Claude on behalf of <name>" appended to
  their Note. If a parts-list line fails after the project was created,
  the result says which, and the project is kept.

### Inventory

`POST /bulk-import/commit` **adds** each row's quantity to a matching
existing part (same name and brand, ignoring case/spaces/punctuation; a
row without a brand matches a branded part). Importing a full stock count
on top of existing stock would double it, so the preview shows every
"10 -> 15" before anything is written, and says to use `update_component`
(which sets an absolute quantity) for stock counts. Categories must
already exist; unknown ones are listed and those parts are created
uncategorized, as in the web app.

### Deleting

`preview_delete` covers a whole project (its parts list and media go with
it, including stored files; linked change requests lose their project
link; everyone is notified), a single parts-list line (the inventory part
stays), or a media item (and its stored file). Inventory parts and change
requests can't be deleted from here.

### Reserving a BOM

`POST /bom/{id}/reserve` deducts every line that was "available" when the
BOM was checked, skips the rest, and can't be repeated (409) or undone. Two
things shape the tools around it:

- **PF-AIR can't read a checked BOM back** (there's no `GET /bom/{id}`), so
  only BOMs checked with `check_bom` since the server last started can be
  previewed. Otherwise the preview asks for `check_bom` to be re-run (which
  creates a new BOM id) or for the reservation to be done in the web app.
- **The backend trusts the status saved at check time.** If stock has
  dropped since, it still deducts and floors the quantity at 0 instead of
  skipping. So the preview re-reads live stock and won't issue a code if
  any part is now below what's needed, and `reserve_bom` checks again
  just before writing and refuses if anything moved since the preview.

### Submitting a change request

PF-AIR has **no draft state**: `POST /ecr` creates a live request with
status `submitted` and immediately notifies the tagged approver — or
everyone, if nobody is tagged. The preview spells out which. Untagged
requests can't be approved or rejected by anyone until someone tags an
approver in the web app.

- The approver is looked up by email (exact) or name (exact, then
  partial); an ambiguous name lists the matches instead of guessing.
- The service account itself can't be tagged as approver — only the
  tagged approver can approve or reject, and that should be a person.
- If both `component_id` and `component_name` are given, the free-text
  name is dropped (PF-AIR keeps the real inventory part), and the preview
  says so.

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

This project doesn't run the backend locally day to day (it deploys to
Render, which is already connected to the real Supabase data), so create
the account against the live Render URL rather than `localhost:8000`
unless you specifically are running a local backend.

**On Windows, use PowerShell's `Invoke-RestMethod`, not `curl` with escaped
double quotes.** `curl -d "{\"name\":...}"` reliably gets its quotes
mangled by PowerShell's own command-line parsing before `curl` ever sees
them — it silently sends an empty `{}` body instead of your real JSON,
which then fails with a confusing "JSON decode error" instead of an
obviously-wrong-input error. `Invoke-RestMethod` with a **single-quoted**
`-Body` string sidesteps this (PowerShell treats single-quoted strings
literally, no escaping needed):

```powershell
Invoke-RestMethod -Uri "https://proforce-tooling-api.onrender.com/api/v1/auth/signup" -Method Post -ContentType "application/json" -TimeoutSec 60 -Body '{"name":"MCP Service Account","email":"mcp-service@proforcedefence.com","staff_id":"MCP-SVC-01","password":"choose-a-strong-password-here"}'
```

On macOS/Linux, a normal `curl` with single-quoted `-d` works fine (no
Windows-specific quoting problem):

```bash
curl -X POST https://proforce-tooling-api.onrender.com/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"MCP Service Account","email":"mcp-service@proforcedefence.com","staff_id":"MCP-SVC-01","password":"choose-a-strong-password-here"}'
```

Two things to expect either way:
- If Render's free tier has been idle, the first request can take
  **30–60+ seconds** to respond (cold start) — that's normal, not a
  failure. A quick way to confirm the backend is actually awake first:
  `Invoke-RestMethod -Uri ".../api/v1/health" -TimeoutSec 60` responds
  instantly once it's warm and doesn't touch the database, so it's a
  useful way to tell "still waking up" apart from a real problem.
- A `409 Conflict` back from the signup call means this exact account
  already exists — that's fine, it just means you can go straight to
  using those same credentials rather than treating it as a failure.

Pick a `staff_id` that won't collide with a real person's (anything
unused works — `staff_id` just has to be unique). Then fill in `mcp/.env`:

```bash
PFAIR_BASE_URL=https://proforce-tooling-api.onrender.com
PFAIR_API_PREFIX=/api/v1
PFAIR_SERVICE_EMAIL=mcp-service@proforcedefence.com
PFAIR_SERVICE_PASSWORD=choose-a-strong-password-here
PFAIR_OPERATOR_NAME=Your Name
PFAIR_LOG_FILE=./logs/tool_calls.log
```

(If you do have a local backend running and want to point this server at
it instead, swap `PFAIR_BASE_URL` to `http://localhost:8000` and run the
signup request against that instead — the command's otherwise identical.)

**Never commit `.env`** — `mcp/.gitignore` already excludes it (and
`mcp/logs/`), same idea as `backend/.gitignore`'s own `.env` exclusion.
If you install via the `.mcpb` Desktop Extension below instead, you won't
touch `.env` at all — credentials get entered through the install prompt.

### Try it standalone (optional, before wiring up Claude Desktop)

The [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
lets you call tools by hand and see raw results, without Claude Desktop:

```bash
npx @modelcontextprotocol/inspector uv run pfair-mcp
```

(Not `mcp dev src/pfair_mcp/server.py` — that launches the file with a
separate copy of `mcp` that can't import the `pfair_mcp` package, and the
Inspector just shows "Connection closed". `uv run pfair-mcp` starts the
server from this project's own environment, the same way the extension does.)

This opens a local web UI where you can pick a tool (e.g.
`check_project_shortfall`), fill in its arguments, and run it against
whatever backend `PFAIR_BASE_URL` points at.

## Connect it to Claude Desktop

### Option A: Desktop Extension (.mcpb) — recommended

Some builds of the Claude desktop app (the Cowork-era client in particular)
don't read local server entries from a hand-edited `claude_desktop_config.json`
the traditional way — they install local servers as a packaged **Desktop
Extension** instead, via a "Drag .MCPB or .DXT files here to install" drop
zone under Settings → wherever local/installed servers are listed (next to
whatever other local MCP servers, like Claude in Chrome, already show up
there). If you're not sure which your build uses, try this first — it's the
one your app's own UI offers.

`manifest.json` and `.mcpbignore` in this folder build that package:

```bash
cd mcp
npm install -g @anthropic-ai/mcpb   # one-time
mcpb pack . pfair-tooling.mcpb
```

Then drag `pfair-tooling.mcpb` into that drop zone in Claude Desktop. It'll
prompt you for four fields at install time — **PF-AIR backend URL**
(defaults to the Render URL), **service account email**, **service
account password**, and **your name** (see [Write tools](#write-tools)) — instead of you editing `.env` or any config file by
hand. Those values get passed to the server as environment variables at
launch, the same `PFAIR_*` variables `config.py` already reads, so nothing
about the server code itself changes based on how it was installed.

### Option B: manual `claude_desktop_config.json` entry

If your build does use the traditional config file, open it:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

and add an entry under `mcpServers` (merge with whatever's already there —
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

A real gotcha to know about on Windows: some MSIX-packaged builds read a
*different*, virtualized copy of `claude_desktop_config.json` than the one
their own "Edit Config" button opens, so edits through that button silently
don't take effect. If Option A's drop zone exists in your build, it sidesteps
this problem entirely — use it instead of chasing down which config file
copy is the real one.

Either way, quit and reopen Claude Desktop completely (not just close the
window) for it to pick up the new server. Once it's running, Claude Desktop
shows `pfair-tooling` listed among its local MCP servers / in the tools
picker — check that its 8 tools are listed there.

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
duration in milliseconds. Write tools (`reserve_bom`, `submit_ecr`) also
log the operator name and the result — what was deducted, or the new
request's id. Example line:

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
- **"Couldn't reach the PF-AIR backend ... timed out"** — almost always
  Render's free tier waking up from idle; the first request after a quiet
  spell can take 60+ seconds. The client waits up to 90 seconds, so this
  should be rare — just ask again a minute later.
- **"Couldn't reach the PF-AIR backend" (any other reason)** — run
  `uv run python diagnose_connection.py` from `mcp/`. It uses the same
  settings as the server and reports, step by step, whether `/health`,
  the login, and `/projects` work, with the exact error type and timing.
  If it passes but Claude Desktop still can't connect, the problem is in
  how the extension was installed or configured, not the network.
- **"PF-AIR returned an error: Incorrect email or password."** — the
  service account's credentials in `.env` don't match what you signed up
  with; re-run the signup `curl` command or double-check for typos.
- **Claude Desktop doesn't show the `pfair-tooling` tools at all** — this
  is almost always the config file: invalid JSON (a trailing comma, an
  unescaped backslash on Windows) silently stops Claude Desktop from
  loading *any* server. Validate the file's JSON, and fully quit/reopen
  the app after editing it.
