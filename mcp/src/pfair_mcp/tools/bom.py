"""check_bom — wraps POST /bom/check (see backend/app/api/routes/bom.py).

Note on scope: this endpoint checks a BOM *spreadsheet file* you hand it —
PF-AIR has no concept of a BOM stored against a project, so this can't
answer "what's short for project X" by itself. That question is
`check_project_shortfall` in tools/projects.py, which works off a
project's MIL (Minimum Item List) instead. check_bom is for "I have this
BOM file, what's missing from inventory" — a one-off upload, same as the
web app's "Check BOM" feature.
"""

from __future__ import annotations

import base64
import binascii
import mimetypes

from mcp.server.mcpserver import MCPServer

from pfair_mcp.client import get_client
from pfair_mcp.logging_setup import run_logged


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

    summary = data["summary"]
    lines = [
        f"BOM '{data['filename']}' (id={data['bom_id']}): "
        f"{summary['available']} available, {summary['low_stock']} low stock, "
        f"{summary['missing']} missing out of {len(data['items'])} line items."
    ]

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


def register(mcp: MCPServer) -> None:
    @mcp.tool()
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
