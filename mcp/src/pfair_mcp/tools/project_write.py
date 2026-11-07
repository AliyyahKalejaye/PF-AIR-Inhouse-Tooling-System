"""Creating and editing projects and their parts lists (MILs) — wraps
POST/PATCH /projects, the /projects/{id}/mil-items routes and
POST /projects/{id}/media/link (backend/app/api/routes/projects.py).

How files get in: when someone attaches a project document in the chat,
Claude reads it and passes the details here as plain fields. That's why
these tools take text, not files — the extension runs on each person's
computer and can't see chat attachments. (PF-AIR's own
/projects/parse-document is a rule-based heading matcher for .docx/.pdf
uploads in the web app; Claude reading the document does the same job
from inside the chat, including documents that don't follow the template.)

Write rules (agreed with the user):
- Creating a project goes through preview_new_project -> create_project,
  because it's several writes at once (the project plus each parts-list
  line) and notifies everyone.
- Single edits (update_project, add/set a parts-list line, add a link) run
  directly; the MCP client's approval prompt is the checkpoint.
- Removing anything lives in tools/deletes.py, behind a preview + code.
"""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import MCPServer
from pydantic import BaseModel, Field

from pfair_mcp import confirmations
from pfair_mcp.client import PFAirAPIError, get_client
from pfair_mcp.config import get_settings
from pfair_mcp.logging_setup import run_logged
from pfair_mcp.tools._format import READ_ONLY, WRITE_ADDITIVE
from pfair_mcp.tools._resolve import is_uuid, normalize_key, resolve_component

STATUSES = ("active", "done", "paused", "relegated")
TITLE_MAX = 300
# The project write-up's text fields, in the web app's form order
# (backend app/schemas/project.py's PROJECT_TEXT_FIELDS, minus title).
TEXT_FIELDS = (
    "problem_statement",
    "abstract",
    "specifications",
    "requirement",
    "next_steps",
    "note",
)
_LABELS = {
    "problem_statement": "Problem statement",
    "abstract": "Abstract",
    "specifications": "Specifications",
    "requirement": "Requirement",
    "next_steps": "Next steps",
    "note": "Note",
}


class PartLine(BaseModel):
    part: str = Field(description="Inventory part name (exact) or its id.")
    quantity: int = Field(default=1, ge=1, description="How many the project needs.")


def _clip(text: str, limit: int = 400) -> str:
    text = text.strip()
    return (
        text if len(text) <= limit else f"{text[:limit].rstrip()}… ({len(text) - limit} more chars)"
    )


async def _resolve_parts(
    parts: list[PartLine],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Resolve each line to a real component, merging repeats of the same
    part (PF-AIR allows each part once per parts list). Returns
    (resolved lines, problems)."""
    merged: dict[str, dict[str, Any]] = {}
    problems: list[str] = []
    for line in parts:
        component, message = await resolve_component(line.part)
        if component is None:
            problems.append(message or f"Couldn't find {line.part!r}.")
            continue
        entry = merged.setdefault(
            component["id"],
            {
                "component_id": component["id"],
                "name": component["name"],
                "stock": component["quantity"],
                "quantity": 0,
            },
        )
        entry["quantity"] += line.quantity
    return list(merged.values()), problems


async def _preview_new_project(
    title: str,
    fields: dict[str, str | None],
    status: str,
    parts: list[PartLine] | None,
) -> str:
    if error := confirmations.operator_missing():
        return error
    operator = get_settings().operator_name.strip()

    title = title.strip()
    status = status.strip().lower()
    problems = []
    if not title:
        problems.append("title is empty")
    elif len(title) > TITLE_MAX:
        problems.append(f"title is {len(title)} characters (max {TITLE_MAX})")
    if status not in STATUSES:
        problems.append(f"status must be one of {', '.join(STATUSES)}")
    if problems:
        return "Can't preview this project: " + "; ".join(problems) + "."

    client = get_client()
    existing = await client.get("/projects")
    same_title = [p for p in existing if normalize_key(p["title"]) == normalize_key(title)]

    resolved, part_problems = await _resolve_parts(parts or [])
    if part_problems:
        return (
            "Can't preview yet — some parts-list lines don't match exactly one inventory "
            "part. Use the exact name or id, or leave the line out (it can be added later, "
            "or the part created first with preview_inventory_import):\n"
            + "\n".join(f"- {p}" for p in part_problems)
        )

    clean = {k: (v.strip() if v and v.strip() else None) for k, v in fields.items()}
    attribution = f"Created via Claude on behalf of {operator}."
    clean["note"] = "\n\n".join(x for x in (clean.get("note"), attribution) if x)

    lines = [f"New project preview: {title} [{status}]", ""]
    for key in TEXT_FIELDS:
        value = clean.get(key)
        lines.append(f"{_LABELS[key]}: {_clip(value) if value else '(empty)'}")
    lines.append("")
    if resolved:
        lines.append(f"Parts list ({len(resolved)}):")
        for r in resolved:
            lines.append(f"- {r['name']}: need {r['quantity']} ({r['stock']} in stock)")
    else:
        lines.append("Parts list: none (can be added later).")
    lines.append("")
    lines.append("Creating it notifies everyone in PF-AIR ('New project created').")
    if same_title:
        lines.append(
            "Warning: a project with this title already exists: "
            + ", ".join(f"{p['title']} [{p['status']}] id={p['id']}" for p in same_title)
            + ". Creating another makes a duplicate."
        )

    code = confirmations.issue(
        "project_create",
        {"project": {"title": title, "status": status, **clean}, "parts": resolved},
    )
    lines.append("")
    lines.append(
        f'To create it, call create_project(confirmation_code="{code}"). '
        f"The code works once and expires in {confirmations.CODE_TTL_SECONDS // 60} minutes."
    )
    return "\n".join(lines)


async def _create_project(confirmation_code: str) -> str:
    if error := confirmations.operator_missing():
        return error
    try:
        payload = confirmations.consume(confirmation_code, "project_create")
    except confirmations.ConfirmationError as exc:
        return str(exc)

    client = get_client()
    project = await client.post("/projects", json=payload["project"])
    pid = project["id"]

    added, failed = [], []
    for line in payload["parts"]:
        try:
            await client.post(
                f"/projects/{pid}/mil-items",
                json={"component_id": line["component_id"], "quantity_required": line["quantity"]},
            )
            added.append(f"- {line['name']}: {line['quantity']}")
        except PFAirAPIError as exc:
            failed.append(f"- {line['name']}: {exc.detail}")

    lines = [f"Created project '{project['title']}' (id={pid}, status={project['status']})."]
    if added:
        lines.append(f"Parts list ({len(added)} added):")
        lines.extend(added)
    if failed:
        lines.append(
            f"These {len(failed)} parts-list line(s) failed — the project exists, add them "
            "with add_parts_list_item:"
        )
        lines.extend(failed)
    return "\n".join(lines)


async def _update_project(project_id: str, changes: dict[str, str | None]) -> str:
    if error := confirmations.operator_missing():
        return error
    given = {k: v for k, v in changes.items() if v is not None}
    if not given:
        return "Nothing to change — pass at least one field."

    body: dict[str, Any] = {}
    for key, value in given.items():
        value = value.strip()
        if key == "title":
            if not value:
                return "A project's title can't be cleared."
            if len(value) > TITLE_MAX:
                return f"Title is {len(value)} characters (max {TITLE_MAX})."
        if key == "status":
            value = value.lower()
            if value not in STATUSES:
                return f"Status must be one of {', '.join(STATUSES)}."
        # An empty string clears an optional text field.
        body[key] = value or None

    client = get_client()
    before = await client.get(f"/projects/{project_id}")
    after = await client.patch(f"/projects/{project_id}", json=body)

    lines = [f"Updated '{after['title']}' (id={project_id}):"]
    for key in body:
        old, new = before.get(key), after.get(key)
        label = "Title" if key == "title" else "Status" if key == "status" else _LABELS[key]
        lines.append(
            f"- {label}: {_clip(old, 120) if old else '(empty)'} -> "
            f"{_clip(new, 120) if new else '(empty)'}"
        )
    if "status" in body and before["status"] != after["status"]:
        lines.append("Everyone in PF-AIR is notified of the status change.")
    return "\n".join(lines)


async def find_parts_list_item(
    project: dict[str, Any], part: str
) -> tuple[dict[str, Any] | None, str | None]:
    """Find a line on a project's parts list by component id, or by the
    component's exact (normalised) name. Shared with tools/deletes.py."""
    items = project["mil_items"]
    ref = part.strip()
    if is_uuid(ref):
        match = [i for i in items if i["component"]["id"] == ref or i["id"] == ref]
    else:
        match = [i for i in items if normalize_key(i["component"]["name"]) == normalize_key(ref)]
    if len(match) == 1:
        return match[0], None
    on_list = ", ".join(i["component"]["name"] for i in items) or "nothing yet"
    return None, f"{part!r} isn't on {project['title']}'s parts list. It has: {on_list}."


async def _add_parts_list_item(project_id: str, part: str, quantity: int) -> str:
    if error := confirmations.operator_missing():
        return error
    if quantity < 1:
        return "Quantity must be at least 1."
    component, message = await resolve_component(part)
    if component is None:
        return message or f"Couldn't find {part!r}."
    item = await get_client().post(
        f"/projects/{project_id}/mil-items",
        json={"component_id": component["id"], "quantity_required": quantity},
    )
    stock = item["component"]["quantity"]
    short = f" — short by {quantity - stock}" if stock < quantity else ""
    return f"Added {component['name']} x{quantity} to the parts list ({stock} in stock{short})."


async def _set_parts_list_quantity(project_id: str, part: str, quantity: int) -> str:
    if error := confirmations.operator_missing():
        return error
    if quantity < 1:
        return "Quantity must be at least 1 — to take a part off the list, use preview_delete."
    client = get_client()
    project = await client.get(f"/projects/{project_id}")
    item, message = await find_parts_list_item(project, part)
    if item is None:
        return message or "Not found."
    old = item["quantity_required"]
    updated = await client.patch(
        f"/projects/{project_id}/mil-items/{item['id']}", json={"quantity_required": quantity}
    )
    name = updated["component"]["name"]
    return f"{name} on {project['title']}'s parts list: {old} -> {quantity}."


async def _add_project_link(project_id: str, url: str, label: str | None) -> str:
    if error := confirmations.operator_missing():
        return error
    url = url.strip()
    if not url.lower().startswith(("http://", "https://")):
        return "The link has to be a full http(s) URL, e.g. https://github.com/org/repo."
    if len(url) > 1000:
        return "That URL is over 1000 characters."
    media = await get_client().post(
        f"/projects/{project_id}/media/link",
        json={"media_type": "code", "file_url": url, "filename": (label or "").strip() or None},
    )
    return f"Attached {media.get('filename') or url} to the project (media id={media['id']})."


def register(mcp: MCPServer) -> None:
    @mcp.tool(annotations=READ_ONLY)
    async def preview_new_project(
        title: str,
        problem_statement: str | None = None,
        abstract: str | None = None,
        specifications: str | None = None,
        requirement: str | None = None,
        next_steps: str | None = None,
        note: str | None = None,
        status: str = "active",
        parts: list[PartLine] | None = None,
    ) -> str:
        """Preview a new PF-AIR project, optionally with its parts list
        (MIL). Changes nothing; returns a confirmation code for
        create_project. Show the preview to the user and get their go-ahead
        before calling create_project.

        When the user attaches a project document, read it and map its
        sections onto these fields (PF-AIR's write-up template uses these
        exact headings). Keep the document's wording; don't summarise
        unless asked. Leave a field unset if the document has nothing
        for it.

        Args:
            title: Project title (max 300 characters).
            problem_statement: What problem the project solves.
            abstract: How it's being solved.
            specifications: Technical specifications.
            requirement: Requirements.
            next_steps: Planned next steps.
            note: Any other notes.
            status: "active" (default), "done", "paused" or "relegated".
            parts: Parts list lines — each an inventory part (exact name or
                id) and quantity needed. Parts must already exist in
                inventory; use search_components to find exact names.
        """
        fields = {
            "problem_statement": problem_statement,
            "abstract": abstract,
            "specifications": specifications,
            "requirement": requirement,
            "next_steps": next_steps,
            "note": note,
        }
        return await run_logged(
            "preview_new_project",
            {"title": title, "status": status, "parts": len(parts or [])},
            lambda: _preview_new_project(title, fields, status, parts),
        )

    @mcp.tool(annotations=WRITE_ADDITIVE)
    async def create_project(confirmation_code: str) -> str:
        """Create the project shown by preview_new_project, with its parts
        list. Notifies everyone in PF-AIR. Only call after the user has
        seen the preview and said go ahead.

        Args:
            confirmation_code: The code preview_new_project returned.
        """
        return await run_logged(
            "create_project",
            {"confirmation_code": confirmation_code, "operator": get_settings().operator_name},
            lambda: _create_project(confirmation_code),
            log_result=True,
        )

    @mcp.tool(annotations=WRITE_ADDITIVE)
    async def update_project(
        project_id: str,
        title: str | None = None,
        problem_statement: str | None = None,
        abstract: str | None = None,
        specifications: str | None = None,
        requirement: str | None = None,
        next_steps: str | None = None,
        note: str | None = None,
        status: str | None = None,
    ) -> str:
        """Edit a project's write-up or status. Only the fields you pass
        change; pass "" to clear a text field. Each field is replaced in
        full, so to add to existing text, read it with get_project first
        and pass the combined text. Changing status notifies everyone.

        Args:
            project_id: The project's id (from list_projects).
            title: New title (can't be cleared).
            problem_statement: New problem statement.
            abstract: New abstract.
            specifications: New specifications.
            requirement: New requirement.
            next_steps: New next steps.
            note: New note.
            status: "active", "done", "paused" or "relegated".
        """
        changes = {
            "title": title,
            "problem_statement": problem_statement,
            "abstract": abstract,
            "specifications": specifications,
            "requirement": requirement,
            "next_steps": next_steps,
            "note": note,
            "status": status,
        }
        return await run_logged(
            "update_project",
            {
                "project_id": project_id,
                "fields": [k for k, v in changes.items() if v is not None],
                "operator": get_settings().operator_name,
            },
            lambda: _update_project(project_id, changes),
            log_result=True,
        )

    @mcp.tool(annotations=WRITE_ADDITIVE)
    async def add_parts_list_item(project_id: str, part: str, quantity: int = 1) -> str:
        """Add an inventory part to a project's parts list (MIL). Each part
        can only be on a list once — to change how many are needed, use
        set_parts_list_quantity.

        Args:
            project_id: The project's id.
            part: Inventory part's exact name or id (see search_components).
            quantity: How many the project needs (at least 1).
        """
        return await run_logged(
            "add_parts_list_item",
            {
                "project_id": project_id,
                "part": part,
                "quantity": quantity,
                "operator": get_settings().operator_name,
            },
            lambda: _add_parts_list_item(project_id, part, quantity),
            log_result=True,
        )

    @mcp.tool(annotations=WRITE_ADDITIVE)
    async def set_parts_list_quantity(project_id: str, part: str, quantity: int) -> str:
        """Change how many of a part a project needs, for a part already on
        its parts list.

        Args:
            project_id: The project's id.
            part: The part's exact name or id, as shown by get_project.
            quantity: New quantity needed (at least 1).
        """
        return await run_logged(
            "set_parts_list_quantity",
            {
                "project_id": project_id,
                "part": part,
                "quantity": quantity,
                "operator": get_settings().operator_name,
            },
            lambda: _set_parts_list_quantity(project_id, part, quantity),
            log_result=True,
        )

    @mcp.tool(annotations=WRITE_ADDITIVE)
    async def add_project_link(project_id: str, url: str, label: str | None = None) -> str:
        """Attach a link (e.g. a code repository) to a project's media.
        Files like images or CAD can't be attached from the chat — upload
        those in the PF-AIR web app.

        Args:
            project_id: The project's id.
            url: Full http(s) URL.
            label: Optional display name for the link.
        """
        return await run_logged(
            "add_project_link",
            {"project_id": project_id, "url": url, "operator": get_settings().operator_name},
            lambda: _add_project_link(project_id, url, label),
            log_result=True,
        )
