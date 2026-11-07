"""check_bom — wraps POST /bom/check (see backend/app/api/routes/bom.py).

Note on scope: this endpoint checks a BOM *spreadsheet file* you hand it —
PF-AIR has no concept of a BOM stored against a project, so this can't
answer "what's short for project X" by itself. That question is
`check_project_shortfall` in tools/projects.py, which works off a
project's MIL (Minimum Item List) instead. check_bom is for "I have this
BOM file, what's missing from inventory" — a one-off upload, same as the
web app's "Check BOM" feature.

Phase 2 adds reserving a checked BOM's available items — see the
"Reservation" section further down.
"""

from __future__ import annotations

import base64
import binascii
import mimetypes
from typing import Any

from mcp.server.mcpserver import MCPServer

from pfair_mcp import confirmations
from pfair_mcp.client import PFAirAPIError, get_client
from pfair_mcp.config import get_settings
from pfair_mcp.logging_setup import run_logged
from pfair_mcp.tools._format import CREATES_RECORD_ONLY, READ_ONLY, WRITE_IRREVERSIBLE

# check_bom results from this server process, by bom_id. PF-AIR has no
# GET /bom/{id}, so once a BOM has been checked, this is the only place its
# line items can be read back from to preview a reservation. Lost on
# restart — preview_bom_reservation then asks for check_bom to be re-run.
_checked_boms: dict[str, dict[str, Any]] = {}


async def _check_bom(filename: str, file_content_base64: str) -> str:
    try:
        raw_bytes = base64.b64decode(file_content_base64, validate=True)
    except (binascii.Error, ValueError):
        return (
            "file_content_base64 isn't valid base64 — "
            "make sure the file bytes were encoded correctly."
        )

    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    client = get_client()
    data = await client.post(
        "/bom/check",
        files={"file": (filename, raw_bytes, content_type)},
    )

    _checked_boms[str(data["bom_id"])] = data

    summary = data["summary"]
    lines = [
        f"BOM '{data['filename']}' (id={data['bom_id']}): "
        f"{summary['available']} available, {summary['low_stock']} low stock, "
        f"{summary['missing']} missing out of {len(data['items'])} line items."
    ]

    if summary["available"]:
        lines.append(
            "Available items can be reserved (deducted from stock) with "
            f'preview_bom_reservation(bom_id="{data["bom_id"]}").'
        )

    short_items = [i for i in data["items"] if i["status"] in ("low_stock", "missing")]
    if not short_items:
        lines.append("Everything on this BOM is fully available.")
        return "\n".join(lines)

    lines.append("")
    lines.append("Short or missing items:")
    for item in short_items:
        requested = item["quantity_requested"]
        if item["status"] == "missing":
            suggestion = item.get("suggested_component")
            hint = (
                f" (closest match: {suggestion['name']}, "
                f"score {item.get('suggested_match_score', 0):.2f})"
                if suggestion
                else " (no close match found in inventory)"
            )
            lines.append(f"- {item['raw_name']}: need {requested}, NOT FOUND in inventory{hint}")
        else:
            matched = item["matched_component"]
            on_hand = matched["quantity"] if matched else 0
            short_by = max(requested - on_hand, 0)
            lines.append(
                f"- {item['raw_name']}: need {requested}, only {on_hand} in stock "
                f"(short by {short_by})"
            )
    return "\n".join(lines)


# --- Reservation -----------------------------------------------------------
#
# POST /bom/{bom_id}/reserve (backend/app/api/routes/bom.py) deducts every
# line that was "available" *when the BOM was checked* from stock, skips the
# rest, and stamps the BOM as reserved. It has no undo route, and a second
# call on the same BOM is refused with 409.
#
# One backend behaviour worth guarding against: it trusts the status saved
# at check time. If stock has dropped since, it still deducts and floors the
# quantity at 0 rather than refusing. So the preview re-reads every matched
# component's live quantity, refuses to issue a code if any is now below
# what's requested, and reserve_bom checks again right before writing.


async def _live_quantities(component_ids: list[str]) -> dict[str, int]:
    client = get_client()
    quantities: dict[str, int] = {}
    for component_id in component_ids:
        component = await client.get(f"/components/{component_id}")
        quantities[component_id] = component["quantity"]
    return quantities


async def _preview_bom_reservation(bom_id: str) -> str:
    if error := confirmations.operator_missing():
        return error

    data = _checked_boms.get(bom_id)
    if data is None:
        return (
            f"I don't have BOM {bom_id}'s contents in this session — PF-AIR has no way to "
            "read a checked BOM back, so only BOMs checked with check_bom since this server "
            "last started can be reserved from here. Run check_bom on the file again (that "
            "creates a fresh BOM id), or reserve it from the web app's Check BOM screen."
        )

    to_reserve = [
        item
        for item in data["items"]
        if item["status"] == "available" and item.get("matched_component")
    ]
    skipped = [item for item in data["items"] if item not in to_reserve]

    if not to_reserve:
        return (
            f"Nothing on BOM '{data['filename']}' can be reserved — no line item was fully "
            "available when it was checked."
        )

    try:
        live = await _live_quantities([i["matched_component"]["id"] for i in to_reserve])
    except PFAirAPIError as exc:
        if exc.status_code == 404:
            return (
                "A part on this BOM has been deleted from inventory since it was checked. "
                "Run check_bom again before reserving."
            )
        raise

    lines = [f"Reservation preview for BOM '{data['filename']}' (id={bom_id}):", ""]
    changed: list[str] = []
    plan: list[dict[str, Any]] = []
    lines.append(f"Will deduct from stock ({len(to_reserve)}):")
    for item in to_reserve:
        component = item["matched_component"]
        need = item["quantity_requested"]
        have = live[component["id"]]
        lines.append(f"- {component['name']}: take {need}, {have} -> {have - need} left")
        if have < need:
            changed.append(f"- {component['name']}: need {need}, only {have} in stock now")
        plan.append(
            {
                "component_id": component["id"],
                "name": component["name"],
                "quantity": need,
                "stock_at_preview": have,
            }
        )

    if skipped:
        lines.append("")
        lines.append(f"Will skip ({len(skipped)}):")
        for item in skipped:
            reason = (
                "not found in inventory"
                if item["status"] == "missing"
                else "not enough stock to fully reserve"
            )
            lines.append(f"- {item['raw_name']} ({reason})")

    if changed:
        lines.append("")
        lines.append(
            "Can't reserve: stock has dropped since this BOM was checked, and PF-AIR would "
            "still deduct these (leaving them at 0) instead of skipping them:"
        )
        lines.extend(changed)
        lines.append("Run check_bom again to get a BOM that reflects current stock.")
        return "\n".join(lines)

    code = confirmations.issue("bom_reserve", {"bom_id": bom_id, "plan": plan})
    lines.append("")
    lines.append(
        "Reserving can't be undone from here or in the web app — stock would have to be "
        "corrected by hand."
    )
    lines.append(
        f'To go ahead, call reserve_bom(confirmation_code="{code}"). '
        f"The code works once and expires in {confirmations.CODE_TTL_SECONDS // 60} minutes."
    )
    return "\n".join(lines)


async def _reserve_bom(confirmation_code: str) -> str:
    if error := confirmations.operator_missing():
        return error
    try:
        payload = confirmations.consume(confirmation_code, "bom_reserve")
    except confirmations.ConfirmationError as exc:
        return str(exc)

    bom_id = payload["bom_id"]
    plan = payload["plan"]

    # Re-check right before writing: if anyone has used or restocked these
    # parts since the preview, what was approved is no longer what would happen.
    live = await _live_quantities([p["component_id"] for p in plan])
    moved = [p for p in plan if live[p["component_id"]] != p["stock_at_preview"]]
    if moved:
        detail = "\n".join(
            f"- {p['name']}: {p['stock_at_preview']} at preview, {live[p['component_id']]} now"
            for p in moved
        )
        return (
            "Not reserved: stock changed since the preview, so it no longer matches what "
            f"was approved:\n{detail}\nRun preview_bom_reservation again."
        )

    client = get_client()
    result = await client.post(f"/bom/{bom_id}/reserve")
    _checked_boms.pop(bom_id, None)

    operator = get_settings().operator_name.strip()
    lines = [f"Reserved BOM {bom_id} (on behalf of {operator}, via the PF-AIR service account)."]
    lines.append(f"Deducted ({len(result['reserved'])}):")
    for r in result["reserved"]:
        lines.append(f"- {r['name']}: -{r['quantity_deducted']}, {r['remaining_quantity']} left")
    if result["skipped"]:
        lines.append(f"Skipped ({len(result['skipped'])}):")
        for s in result["skipped"]:
            lines.append(f"- {s['raw_name']}: {s['reason']}")
    return "\n".join(lines)


def register(mcp: MCPServer) -> None:
    @mcp.tool(annotations=CREATES_RECORD_ONLY)
    async def check_bom(filename: str, file_content_base64: str) -> str:
        """Check a Bill of Materials spreadsheet against current PF-AIR
        inventory and report which line items are fully available, low
        stock, or missing entirely. This uploads and checks a one-off BOM
        file — it does not look up an existing project's parts list (use
        check_project_shortfall for "what's short for project X").

        Args:
            filename: Original filename, including its extension
                (e.g. "zd550_bom.xlsx") — used to detect the file type.
            file_content_base64: The spreadsheet file's raw bytes,
                base64-encoded.
        """
        return await run_logged(
            "check_bom",
            {"filename": filename, "file_content_base64": file_content_base64},
            lambda: _check_bom(filename, file_content_base64),
        )

    @mcp.tool(annotations=READ_ONLY)
    async def preview_bom_reservation(bom_id: str) -> str:
        """Preview reserving a checked BOM's available items: shows exactly
        which parts would be deducted from stock (with live quantities) and
        which would be skipped. Changes nothing. Returns a confirmation code
        for reserve_bom if the reservation is safe to make.

        Only works for BOMs checked with check_bom since this server last
        started (PF-AIR can't read a checked BOM back). Show the preview to
        the user and get their go-ahead before calling reserve_bom.

        Args:
            bom_id: The id check_bom reported for the BOM.
        """
        return await run_logged(
            "preview_bom_reservation",
            {"bom_id": bom_id},
            lambda: _preview_bom_reservation(bom_id),
        )

    @mcp.tool(annotations=WRITE_IRREVERSIBLE)
    async def reserve_bom(confirmation_code: str) -> str:
        """Reserve a BOM's available items — deducts them from PF-AIR stock.
        This can't be undone. Only call this after showing the user the
        preview_bom_reservation result and getting their explicit go-ahead;
        it performs exactly the reservation that was previewed.

        Args:
            confirmation_code: The code preview_bom_reservation returned.
        """
        return await run_logged(
            "reserve_bom",
            {
                "confirmation_code": confirmation_code,
                "operator": get_settings().operator_name,
            },
            lambda: _reserve_bom(confirmation_code),
            log_result=True,
        )
