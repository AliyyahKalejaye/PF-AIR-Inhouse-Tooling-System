"""Deleting things — always behind a preview and a confirmation code.

Covers what the user agreed Claude may delete: whole projects, lines on a
project's parts list (MIL), and project media. Wraps
DELETE /projects/{id}, DELETE /projects/{id}/mil-items/{item_id} and
DELETE /projects/{id}/media/{media_id} (backend/app/api/routes/projects.py).

None of these can be undone. What each one takes with it (from the
backend's foreign keys and delete routes):
- a project: its parts list and media rows (cascade), the media files in
  storage, and the project link on any change requests (set to empty);
  everyone is notified.
- a parts-list line: just that line; the inventory part itself stays.
- a media item: the row and its file in storage.

Inventory parts and change requests can't be deleted from here.
"""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import MCPServer

from pfair_mcp import confirmations
from pfair_mcp.client import get_client
from pfair_mcp.config import get_settings
from pfair_mcp.logging_setup import run_logged
from pfair_mcp.tools._format import READ_ONLY, WRITE_IRREVERSIBLE
from pfair_mcp.tools.project_write import find_parts_list_item

TARGETS = ("project", "parts_list_item", "media")


def _code_line(code: str) -> str:
    return (
        f'To delete, call confirm_delete(confirmation_code="{code}"). '
        f"The code works once and expires in {confirmations.CODE_TTL_SECONDS // 60} minutes."
    )


async def _preview_delete(
    target: str, project_id: str, part: str | None, media_id: str | None
) -> str:
    if error := confirmations.operator_missing():
        return error
    target = target.strip().lower()
    if target not in TARGETS:
        return f"target must be one of {', '.join(TARGETS)}."

    client = get_client()
    project = await client.get(f"/projects/{project_id}")
    title = project["title"]

    if target == "project":
        ecrs = await client.get("/ecr")
        linked = [e for e in ecrs if (e.get("project") or {}).get("id") == project["id"]]
        lines = [
            f"Delete project '{title}' [{project['status']}] (id={project['id']})?",
            f"- Its parts list ({len(project['mil_items'])} line(s)) is deleted with it. "
            "The inventory parts themselves stay.",
            f"- Its {len(project['media'])} media item(s) are deleted, including the files.",
        ]
        if linked:
            lines.append(
                f"- {len(linked)} change request(s) lose their link to this project (they "
                "aren't deleted): " + ", ".join(f"'{e['title']}'" for e in linked)
            )
        lines.append("- Everyone in PF-AIR is notified ('Project deleted').")
        lines.append("This can't be undone.")
        payload: dict[str, Any] = {
            "path": f"/projects/{project['id']}",
            "summary": f"project '{title}'",
        }

    elif target == "parts_list_item":
        if not part:
            return "Say which part to take off the parts list (its name or id)."
        item, message = await find_parts_list_item(project, part)
        if item is None:
            return message or "Not found."
        name = item["component"]["name"]
        lines = [
            f"Remove {name} (need {item['quantity_required']}) from '{title}'s parts list?",
            "The part stays in inventory; only this project's line for it is removed.",
        ]
        payload = {
            "path": f"/projects/{project['id']}/mil-items/{item['id']}",
            "summary": f"{name} from '{title}'s parts list",
        }

    else:  # media
        if not media_id:
            return "Say which media item to delete (its id, from get_project)."
        media = next((m for m in project["media"] if m["id"] == media_id.strip()), None)
        if media is None:
            listed = "\n".join(
                f"- {m.get('filename') or m['file_url']} ({m['media_type']}) id={m['id']}"
                for m in project["media"]
            )
            return f"No media item {media_id} on '{title}'. It has:\n{listed or '(none)'}"
        label = media.get("filename") or media["file_url"]
        stored = "" if media["media_type"] == "code" else " The file is deleted from storage too."
        lines = [
            f"Delete {label} ({media['media_type']}) from '{title}'?{stored}",
            "This can't be undone.",
        ]
        payload = {
            "path": f"/projects/{project['id']}/media/{media['id']}",
            "summary": f"{label} from '{title}'",
        }

    code = confirmations.issue("delete", payload)
    lines.append("")
    lines.append(_code_line(code))
    return "\n".join(lines)


async def _confirm_delete(confirmation_code: str) -> str:
    if error := confirmations.operator_missing():
        return error
    try:
        payload = confirmations.consume(confirmation_code, "delete")
    except confirmations.ConfirmationError as exc:
        return str(exc)
    await get_client().delete(payload["path"])
    return f"Deleted {payload['summary']}."


def register(mcp: MCPServer) -> None:
    @mcp.tool(annotations=READ_ONLY)
    async def preview_delete(
        target: str,
        project_id: str,
        part: str | None = None,
        media_id: str | None = None,
    ) -> str:
        """Preview deleting a project, a line on a project's parts list, or
        a project media item. Shows exactly what goes with it. Changes
        nothing; returns a confirmation code for confirm_delete. Show the
        preview to the user and get their go-ahead first.

        Inventory parts and change requests can't be deleted from here.

        Args:
            target: "project", "parts_list_item" or "media".
            project_id: The project's id (for all three targets).
            part: For "parts_list_item" — the part's exact name or id.
            media_id: For "media" — the media item's id (from get_project).
        """
        return await run_logged(
            "preview_delete",
            {"target": target, "project_id": project_id, "part": part, "media_id": media_id},
            lambda: _preview_delete(target, project_id, part, media_id),
        )

    @mcp.tool(annotations=WRITE_IRREVERSIBLE)
    async def confirm_delete(confirmation_code: str) -> str:
        """Carry out the deletion shown by preview_delete. Can't be undone.
        Only call after the user has seen the preview and said go ahead.

        Args:
            confirmation_code: The code preview_delete returned.
        """
        return await run_logged(
            "confirm_delete",
            {"confirmation_code": confirmation_code, "operator": get_settings().operator_name},
            lambda: _confirm_delete(confirmation_code),
            log_result=True,
        )
