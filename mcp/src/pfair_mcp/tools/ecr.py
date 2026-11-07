"""list_ecrs, get_ecr — wraps GET /ecr, GET /ecr/{id} and
GET /ecr/{id}/comments (see backend/app/api/routes/ecr.py). get_ecr folds
the comments call in automatically, matching the spec's "ECRs by status,
with comments"."""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

from pfair_mcp.client import get_client
from pfair_mcp.logging_setup import run_logged
from pfair_mcp.tools._format import READ_ONLY


def _who(ref: dict | None) -> str:
    if ref is None:
        return "nobody"
    return f"{ref['name']} <{ref['email']}>" if "email" in ref else ref["name"]


async def _list_ecrs(status: str | None) -> str:
    client = get_client()
    params = {"ecr_status": status} if status else None
    ecrs = await client.get("/ecr", params=params)

    if not ecrs:
        return "No change requests matched."

    lines = [f"{len(ecrs)} change request(s):"]
    for e in ecrs:
        target = e["component"]["name"] if e["component"] else (e["component_name"] or "—")
        project = e["project"]["title"] if e["project"] else "—"
        lines.append(
            f"- [{e['status']}/{e['priority']}] {e['title']} "
            f"(project: {project}, part: {target}, "
            f"requested by {_who(e['requester'])}, "
            f"approver: {_who(e['assigned_approver'])}) id={e['id']}"
        )
    return "\n".join(lines)


async def _get_ecr(ecr_id: str) -> str:
    client = get_client()
    e = await client.get(f"/ecr/{ecr_id}")
    comments = await client.get(f"/ecr/{ecr_id}/comments")

    target = e["component"]["name"] if e["component"] else (e["component_name"] or "—")
    project = e["project"]["title"] if e["project"] else "—"

    lines = [
        f"{e['title']} [{e['status']}/{e['priority']}] (id={e['id']})",
        f"Project: {project} | Part: {target}",
        f"Requested by: {_who(e['requester'])}",
        f"Approver: {_who(e['assigned_approver'])}",
        f"Reason: {e['reason']}",
    ]
    if e.get("description"):
        lines.append(f"Description: {e['description']}")
    if e["status"] in ("approved", "rejected") and e.get("reviewer"):
        lines.append(f"Decided by: {_who(e['reviewer'])}")
        if e.get("review_notes"):
            lines.append(f"Review notes: {e['review_notes']}")

    if not comments:
        lines.append("Comments: none yet.")
    else:
        lines.append(f"Comments ({len(comments)}):")
        for c in comments:
            author = _who(c["author"]) if c["author"] else "deleted user"
            lines.append(f"  [{c['created_at']}] {author}: {c['body']}")
    return "\n".join(lines)


def register(mcp: MCPServer) -> None:
    @mcp.tool(annotations=READ_ONLY)
    async def list_ecrs(status: str | None = None) -> str:
        """List Engineering Change Requests, optionally filtered by status.

        Args:
            status: Optional status filter — one of "submitted", "approved",
                "rejected", "implemented". Leave unset to list all.
        """
        return await run_logged("list_ecrs", {"status": status}, lambda: _list_ecrs(status))

    @mcp.tool(annotations=READ_ONLY)
    async def get_ecr(ecr_id: str) -> str:
        """Get full detail for one Engineering Change Request, including
        who requested it, who's tagged to approve it, its review notes if
        decided, and its full discussion/comment thread.

        Args:
            ecr_id: The change request's UUID (from list_ecrs).
        """
        return await run_logged("get_ecr", {"ecr_id": ecr_id}, lambda: _get_ecr(ecr_id))
