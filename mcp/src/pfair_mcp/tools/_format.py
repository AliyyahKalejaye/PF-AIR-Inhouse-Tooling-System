"""Shared formatting helpers so components/bom/projects don't each
re-invent "how do I describe a component's stock level in one line"."""

from __future__ import annotations

from typing import Any

from mcp.types import ToolAnnotations

# Annotations tell the MCP client what each tool does, so it can decide
# which calls to run freely and which to ask the user about first.
# open_world_hint=False: these tools only touch PF-AIR, not the open web.
READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)
# check_bom saves the uploaded BOM as a record in PF-AIR (that's what gives
# it a bom_id to reserve against), so it isn't strictly read-only — but it
# doesn't change stock or anything else that already existed.
CREATES_RECORD_ONLY = ToolAnnotations(
    read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False
)
# The two Phase 2 write tools. destructive_hint=True on reserve_bom since it
# deducts stock and has no undo; submit_ecr only adds a record (and sends
# notifications), so it isn't destructive, but it's still a real write.
WRITE_IRREVERSIBLE = ToolAnnotations(
    read_only_hint=False, destructive_hint=True, idempotent_hint=False, open_world_hint=False
)
WRITE_ADDITIVE = ToolAnnotations(
    read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False
)


def stock_label(component: dict[str, Any]) -> str:
    if component.get("is_out_of_stock"):
        return "OUT OF STOCK"
    if component.get("is_low_stock"):
        return "LOW STOCK"
    return "in stock"


def component_line(component: dict[str, Any]) -> str:
    sku = f" (SKU {component['sku']})" if component.get("sku") else ""
    category = component.get("category")
    category_name = category["name"] if category else "uncategorized"
    return (
        f"- {component['name']}{sku} — {component['quantity']} on hand "
        f"[{stock_label(component)}, threshold {component['low_stock_threshold']}], "
        f"{category_name}, id={component['id']}"
    )
