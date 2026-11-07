"""list_projects, get_project, check_project_shortfall — wraps GET /projects
and GET /projects/{id} (see backend/app/api/routes/projects.py).

check_project_shortfall is not in the original spec's endpoint list — it's
built on top of GET /projects/{id}'s mil_items, computed client-side here,
because PF-AIR has no stored per-project BOM to check (see tools/bom.py's
module docstring). This is the tool that actually answers "what are we
short for the ZD550 build?" — list_projects first (optionally filtered by
title) to find the project's id, then check_project_shortfall(project_id).
"""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

from pfair_mcp.client import get_client
from pfair_mcp.logging_setup import run_logged
from pfair_mcp.tools._format import READ_ONLY


async def _list_projects(status: str | None, title_contains: str | None) -> str:
    client = get_client()
    params = {"project_status": status} if status else None
    projects = await client.get("/projects", params=params)

    if title_contains:
        needle = title_contains.strip().lower()
        projects = [p for p in projects if needle in p["title"].lower()]

    if not projects:
        return "No projects matched."

    lines = [f"{len(projects)} project(s):"]
    for p in projects:
        snippet = f" — {p['snippet']}" if p.get("snippet") else ""
        lines.append(f"- {p['title']} [{p['status']}] id={p['id']}{snippet}")
    return "\n".join(lines)


_WRITE_UP = (
    ("problem_statement", "Problem statement"),
    ("abstract", "Abstract"),
    ("specifications", "Specifications"),
    ("requirement", "Requirement"),
    ("next_steps", "Next steps"),
    ("note", "Note"),
)


async def _get_project(project_id: str) -> str:
    client = get_client()
    p = await client.get(f"/projects/{project_id}")

    lines = [f"{p['title']} [{p['status']}] (id={p['id']})"]
    for key, label in _WRITE_UP:
        if p.get(key):
            lines.append(f"{label}: {p[key]}")

    mil_items = p["mil_items"]
    if not mil_items:
        lines.append("Parts list (MIL): no items added yet.")
    else:
        lines.append(f"Parts list (MIL, {len(mil_items)} item(s)):")
        for item in mil_items:
            component = item["component"]
            lines.append(
                f"- {component['name']}: need {item['quantity_required']}, "
                f"{component['quantity']} in stock, id={component['id']}"
            )

    media = p["media"]
    if media:
        lines.append(f"Media ({len(media)}):")
        for m in media:
            label = m.get("filename") or m["file_url"]
            lines.append(f"- {label} ({m['media_type']}) id={m['id']}")
    return "\n".join(lines)


async def _check_project_shortfall(project_id: str) -> str:
    client = get_client()
    p = await client.get(f"/projects/{project_id}")
    mil_items = p["mil_items"]

    if not mil_items:
        return f"{p['title']} has no MIL items defined, so there's nothing to check."

    short: list[str] = []
    ok: list[str] = []
    for item in mil_items:
        component = item["component"]
        required = item["quantity_required"]
        on_hand = component["quantity"]
        shortfall = max(required - on_hand, 0)
        if shortfall > 0:
            short.append(
                f"- {component['name']}: need {required}, have {on_hand} "
                f"— short by {shortfall} (id={component['id']})"
            )
        else:
            ok.append(f"- {component['name']}: need {required}, have {on_hand} — covered")

    lines = [f"Shortfall check for {p['title']} ({len(mil_items)} MIL item(s)):"]
    if short:
        lines.append(f"\nSHORT ({len(short)}):")
        lines.extend(short)
    else:
        lines.append("\nNothing is short — every MIL item has enough stock.")
    if ok:
        lines.append(f"\nCovered ({len(ok)}):")
        lines.extend(ok)
    return "\n".join(lines)


def register(mcp: MCPServer) -> None:
    @mcp.tool(annotations=READ_ONLY)
    async def list_projects(status: str | None = None, title_contains: str | None = None) -> str:
        """List PF-AIR engineering projects, optionally filtered by status
        and/or a title search term. Use this to find a project's id before
        calling get_project or check_project_shortfall.

        Args:
            status: Optional status filter — one of "active", "done",
                "paused", "relegated". Leave unset to list all statuses.
            title_contains: Optional case-insensitive substring to match
                against project titles (e.g. "ZD550").
        """
        return await run_logged(
            "list_projects",
            {"status": status, "title_contains": title_contains},
            lambda: _list_projects(status, title_contains),
        )

    @mcp.tool(annotations=READ_ONLY)
    async def get_project(project_id: str) -> str:
        """Get a project's full detail: write-up, status, and its MIL
        (Minimum Item List) — the real components it needs and the
        quantity required of each, alongside their current stock.

        Args:
            project_id: The project's UUID (from list_projects).
        """
        return await run_logged(
            "get_project", {"project_id": project_id}, lambda: _get_project(project_id)
        )

    @mcp.tool(annotations=READ_ONLY)
    async def check_project_shortfall(project_id: str) -> str:
        """Check a project's MIL (Minimum Item List) against current
        inventory and report which required parts are short and by how
        much. This is the right tool for "what are we short for <project>
        build?" — it does not need a BOM file (see check_bom for checking
        an uploaded spreadsheet instead of a project's MIL).

        Args:
            project_id: The project's UUID (from list_projects).
        """
        return await run_logged(
            "check_project_shortfall",
            {"project_id": project_id},
            lambda: _check_project_shortfall(project_id),
        )
