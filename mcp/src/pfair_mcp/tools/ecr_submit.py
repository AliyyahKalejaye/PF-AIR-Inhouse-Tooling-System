"""preview_ecr / submit_ecr — wraps POST /ecr (backend/app/api/routes/ecr.py).

PF-AIR has no draft state for change requests: POST /ecr creates a live
request with status "submitted" and immediately notifies either the tagged
approver or, if nobody is tagged, everyone. So these tools submit — there's
no "save as draft" — and the preview says who will be notified.

Requests are created as the shared service account, so the requester field
in PF-AIR will show that account. To keep a record of who actually asked,
an "on behalf of <operator>" line is appended to the description (the
operator name comes from PFAIR_OPERATOR_NAME).

Deliberately absent: approve, reject, implement, edit and delete. Those
stay with people in the web app. The service account can't be tagged as
approver either — only the tagged approver can approve or reject, and that
should always be a real person.
"""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import MCPServer

from pfair_mcp import confirmations
from pfair_mcp.client import PFAirAPIError, get_client
from pfair_mcp.config import get_settings
from pfair_mcp.logging_setup import run_logged
from pfair_mcp.tools._format import READ_ONLY, WRITE_ADDITIVE

PRIORITIES = ("low", "medium", "high", "urgent")
TITLE_MAX = 300


def _attribution(operator: str) -> str:
    return f"Submitted via Claude on behalf of {operator}."


async def _resolve_approver(query: str) -> tuple[dict[str, Any] | None, str | None]:
    """Find one PF-AIR user by email (exact) or name (exact, then partial).
    Returns (user, None) on a single match, or (None, message) otherwise."""
    users = await get_client().get("/ecr/approvers")
    q = query.strip().lower()

    matches = [u for u in users if (u.get("email") or "").lower() == q]
    if not matches:
        matches = [u for u in users if u["name"].lower() == q]
    if not matches:
        matches = [
            u for u in users if q in u["name"].lower() or q in (u.get("email") or "").lower()
        ]

    if not matches:
        return None, f"No PF-AIR user matches approver {query!r}."
    if len(matches) > 1:
        options = "\n".join(f"- {u['name']} <{u.get('email')}>" for u in matches)
        return None, (
            f"Approver {query!r} matches more than one person — use their email instead:\n{options}"
        )
    return matches[0], None


async def _preview_ecr(
    title: str,
    reason: str,
    description: str | None,
    priority: str,
    project_id: str | None,
    component_id: str | None,
    component_name: str | None,
    approver: str | None,
) -> str:
    if error := confirmations.operator_missing():
        return error
    settings = get_settings()
    operator = settings.operator_name.strip()

    title = title.strip()
    reason = reason.strip()
    problems = []
    if not title:
        problems.append("title is empty")
    elif len(title) > TITLE_MAX:
        problems.append(f"title is {len(title)} characters (max {TITLE_MAX})")
    if not reason:
        problems.append("reason is empty")
    priority = priority.strip().lower()
    if priority not in PRIORITIES:
        problems.append(f"priority must be one of {', '.join(PRIORITIES)}")
    if component_name and len(component_name) > TITLE_MAX:
        problems.append(f"component_name is over {TITLE_MAX} characters")
    if problems:
        return "Can't preview this change request: " + "; ".join(problems) + "."

    client = get_client()
    notes: list[str] = []

    project_label = "none"
    if project_id:
        try:
            project = await client.get(f"/projects/{project_id}")
        except PFAirAPIError as exc:
            if exc.status_code in (404, 422):
                return f"No project with id {project_id} — check it with list_projects."
            raise
        project_label = f"{project['title']} ({project_id})"

    part_label = "none"
    if component_id:
        try:
            component = await client.get(f"/components/{component_id}")
        except PFAirAPIError as exc:
            if exc.status_code in (404, 422):
                return f"No component with id {component_id} — check it with search_components."
            raise
        part_label = f"{component['name']} ({component_id})"
        if component_name:
            notes.append(
                "component_name is ignored because component_id is set (PF-AIR keeps the "
                "inventory part and drops the free-text name)."
            )
            component_name = None
    elif component_name:
        part_label = f"{component_name.strip()} (free text — not linked to an inventory item)"

    approver_user: dict[str, Any] | None = None
    if approver:
        approver_user, message = await _resolve_approver(approver)
        if message:
            return message
        assert approver_user is not None
        if (approver_user.get("email") or "").lower() == settings.service_email.lower():
            return (
                "The PF-AIR service account can't be tagged as approver — only the tagged "
                "approver can approve or reject, and that has to be a real person."
            )

    full_description = "\n\n".join(
        part for part in ((description or "").strip(), _attribution(operator)) if part
    )

    payload: dict[str, Any] = {
        "title": title,
        "reason": reason,
        "description": full_description,
        "priority": priority,
        "project_id": project_id or None,
        "component_id": component_id or None,
        "component_name": component_name.strip() if component_name else None,
        "assigned_approver_id": approver_user["id"] if approver_user else None,
    }

    if approver_user:
        approver_label = f"{approver_user['name']} <{approver_user.get('email')}>"
        notify = f"{approver_user['name']} is notified that it needs their review."
    else:
        approver_label = "nobody"
        notify = (
            "Everyone is notified (no approver tagged). Nobody can approve or reject it "
            "until someone edits it in the web app to tag an approver."
        )

    lines = [
        "Change request preview — submitting creates it straight away as 'submitted' "
        "(PF-AIR has no drafts):",
        "",
        f"Title: {title}",
        f"Priority: {priority}",
        f"Project: {project_label}",
        f"Part: {part_label}",
        f"Approver: {approver_label}",
        f"Reason: {reason}",
        f"Description:\n{full_description}",
        "",
        f"Requester in PF-AIR will show as the service account ({settings.service_email}).",
        notify,
    ]
    if notes:
        lines.append("")
        lines.extend(f"Note: {n}" for n in notes)

    code = confirmations.issue("ecr_submit", payload)
    lines.append("")
    lines.append(
        f'To submit, call submit_ecr(confirmation_code="{code}"). '
        f"The code works once and expires in {confirmations.CODE_TTL_SECONDS // 60} minutes."
    )
    return "\n".join(lines)


async def _submit_ecr(confirmation_code: str) -> str:
    if error := confirmations.operator_missing():
        return error
    try:
        payload = confirmations.consume(confirmation_code, "ecr_submit")
    except confirmations.ConfirmationError as exc:
        return str(exc)

    ecr = await get_client().post("/ecr", json=payload)
    approver = ecr.get("assigned_approver")
    who = f"awaiting review by {approver['name']}" if approver else "no approver tagged yet"
    return (
        f"Submitted change request '{ecr['title']}' (id={ecr['id']}, status={ecr['status']}, "
        f"priority={ecr['priority']}) — {who}. It's in the web app under /ecr/{ecr['id']}."
    )


def register(mcp: MCPServer) -> None:
    @mcp.tool(annotations=READ_ONLY)
    async def preview_ecr(
        title: str,
        reason: str,
        description: str | None = None,
        priority: str = "medium",
        project_id: str | None = None,
        component_id: str | None = None,
        component_name: str | None = None,
        approver: str | None = None,
    ) -> str:
        """Preview a new Engineering Change Request: validates the project,
        part and approver, and shows exactly what would be created and who
        would be notified. Changes nothing. Returns a confirmation code for
        submit_ecr.

        PF-AIR has no drafts — submitting creates a live request and sends
        notifications — so show this preview to the user and get their
        go-ahead before calling submit_ecr.

        Args:
            title: Short summary of the change (max 300 characters).
            reason: Why the change is needed.
            description: Optional detail on what should change.
            priority: One of "low", "medium", "high", "urgent".
            project_id: Optional project this affects (from list_projects).
            component_id: Optional inventory part this affects (from
                search_components).
            component_name: Free-text part name, only for parts not in
                inventory yet. Ignored if component_id is given.
            approver: Who should review it, by email (preferred) or name.
                Only that person can approve or reject it. Leave unset to
                notify everyone, but then nobody can approve it until
                someone tags an approver in the web app.
        """
        return await run_logged(
            "preview_ecr",
            {
                "title": title,
                "priority": priority,
                "project_id": project_id,
                "component_id": component_id,
                "component_name": component_name,
                "approver": approver,
            },
            lambda: _preview_ecr(
                title,
                reason,
                description,
                priority,
                project_id,
                component_id,
                component_name,
                approver,
            ),
        )

    @mcp.tool(annotations=WRITE_ADDITIVE)
    async def submit_ecr(confirmation_code: str) -> str:
        """Submit the change request shown by preview_ecr. This creates it
        in PF-AIR and notifies people straight away. Only call this after
        showing the user the preview and getting their explicit go-ahead;
        it submits exactly what was previewed.

        Args:
            confirmation_code: The code preview_ecr returned.
        """
        return await run_logged(
            "submit_ecr",
            {
                "confirmation_code": confirmation_code,
                "operator": get_settings().operator_name,
            },
            lambda: _submit_ecr(confirmation_code),
            log_result=True,
        )
