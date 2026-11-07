"""check_bom — wraps POST /bom/check (see backend/app/api/routes/bom.py).

The backend only accepts a spreadsheet upload, but the extension can't see
files attached in the chat, so Claude reads the attached BOM and passes its
lines; _lines_to_csv turns them back into a CSV for the upload.

Note on scope: this endpoint checks a BOM —
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

import csv
import io
from typing import Any

from mcp.server.mcpserver import MCPServer
from pydantic import BaseModel, Field

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


class BOMLine(BaseModel):
    part: str = Field(description="Part name as written on the BOM.")
    quantity: int = Field(default=1, ge=1, description="Quantity needed.")


def _lines_to_csv(lines: list[BOMLine]) -> bytes:
    """POST /bom/check only accepts a .csv/.xlsx upload. Claude reads the
    BOM the user attached and passes its lines; this writes them into a
    two-column CSV with headers the backend's extract_bom_lines recognises
    exactly ("Part", "Qty"), so matching works the same as a web upload."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Part", "Qty"])
    for line in lines:
        writer.writerow([line.part.strip(), line.quantity])
    return buffer.getvalue().encode("utf-8")


async def _check_bom(bom_name: str, lines: list[BOMLine]) -> str:
    lines = [line for line in lines if line.part.strip()]
    if not lines:
        return "The BOM has no lines with a part name."

    stem = bom_name.strip().rsplit(".", 1)[0] or "bom"
    client = get_client()
    data = await client.post(
        "/bom/check",
        files={"file": (f"{stem}.csv", _lines_to_csv(lines), "text/csv")},
    )

    _checked_boms[str(data["bom_id"])] = data

    summary = data["summary"]
    out = [
        f"BOM '{data['filename']}' (id={data['bom_id']}): "
        f"{summary['available']} available, {summary['low_stock']} low stock, "
        f"{summary['missing']} missing out of {len(data['items'])} line items."
    ]

    if summary["available"]:
        out.append(
            "Available items can be reserved (deducted from stock) with "
            f'preview_bom_reservation(bom_id="{data["bom_id"]}").'
        )

    short_items = [i for i in data["items"] if i["status"] in ("low_stock", "missing")]
    if not short_items:
        out.append("Everything on this BOM is fully available.")
        return "\n".join(out)

    out.append("")
    out.append("Short or missing items:")
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
            out.append(f"- {item['raw_name']}: need {requested}, NOT FOUND in inventory{hint}")
        else:
            matched = item["matched_component"]
            on_hand = matched["quantity"] if matched else 0
            short_by = max(requested - on_hand, 0)
            out.append(
                f"- {item['raw_name']}: need {requested}, only {on_hand} in stock "
                f"(short by {short_by})"
            )
    return "\n".join(out)


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
    async def check_bom(bom_name: str, lines: list[BOMLine]) -> str:
        """Check a Bill of Materials against current PF-AIR inventory and
        report which lines are fully available, low stock, or missing.
        When the user attaches a BOM file, read its part names and
        quantities and pass them as `lines`. This is a one-off check of a
        BOM — for "what's short for project X" use check_project_shortfall.
        The result gives a bom_id that preview_bom_reservation can use.

        Args:
            bom_name: Name for the BOM, e.g. the attached file's name.
            lines: One entry per BOM line: the part name as written on the
                BOM and the quantity needed.
        """
        return await run_logged(
            "check_bom",
            {"bom_name": bom_name, "lines": len(lines)},
            lambda: _check_bom(bom_name, lines),
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
