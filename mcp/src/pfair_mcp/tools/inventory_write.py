"""Adding to and editing inventory — wraps POST /bulk-import/commit and
PATCH /components/{id} (backend/app/api/routes/bulk_import.py, components.py).

How files get in: when someone attaches an inventory spreadsheet in the
chat, Claude reads its rows and passes them here as structured data. The
commit route takes rows as JSON (the web app's wizard sends exactly that
after its own preview step), so no file needs to reach the backend.

The thing to be careful about: an import ADDS each row's quantity to a
matching existing part's stock (matched by name + brand, see the backend's
app/services/bulk_import.py). Importing a full stock count on top of
existing stock doubles it. preview_inventory_import predicts, row by row,
exactly which parts are created and which existing ones gain stock, using
the same matching rule as the backend, so that's visible before anything
is written. To *set* a part's stock to a counted number, use
update_component instead.
"""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import MCPServer
from pydantic import BaseModel, Field

from pfair_mcp import confirmations
from pfair_mcp.client import get_client
from pfair_mcp.config import get_settings
from pfair_mcp.logging_setup import run_logged
from pfair_mcp.tools._format import READ_ONLY, WRITE_ADDITIVE
from pfair_mcp.tools._resolve import all_components, normalize_key, resolve_component

_SHOW = 60  # max lines per section in a preview, so huge imports stay readable


class InventoryRow(BaseModel):
    name: str = Field(description="Part name.")
    quantity: int = Field(default=0, ge=0, description="Quantity to add.")
    type: str | None = Field(default=None, description="Part type, e.g. Motor, ESC.")
    brand: str | None = None
    category: str | None = Field(default=None, description="Existing PF-AIR category name.")
    description: str | None = None


def _same_part(name_a: str, brand_a: str | None, name_b: str, brand_b: str | None) -> bool:
    """Mirror of backend app/services/bulk_import.py's _same_part — keep in
    step with it, or the preview will predict differently from the import."""
    if normalize_key(name_a) != normalize_key(name_b):
        return False
    brand_key_a, brand_key_b = normalize_key(brand_a), normalize_key(brand_b)
    if brand_key_a and brand_key_b and brand_key_a != brand_key_b:
        return False
    return True


def _clean(value: str | None) -> str | None:
    return value.strip() if value and value.strip() else None


async def _preview_inventory_import(source_name: str, rows: list[InventoryRow]) -> str:
    if error := confirmations.operator_missing():
        return error
    if not rows:
        return "No rows to import."

    existing = await all_components()
    categories = await get_client().get("/categories")
    category_names = {c["name"].strip().lower() for c in categories}

    # Simulate the backend's commit loop: each row matches against existing
    # parts plus parts created by earlier rows in this same import.
    pool: list[dict[str, Any]] = [
        {"id": c["id"], "name": c["name"], "brand": c.get("brand"), "quantity": c["quantity"]}
        for c in existing
    ]
    creates: list[str] = []
    adds: list[str] = []
    skipped: list[str] = []
    unknown_categories: set[str] = set()

    for index, row in enumerate(rows, start=1):
        name = _clean(row.name)
        if not name:
            skipped.append(f"- row {index}: no part name")
            continue
        brand = _clean(row.brand)
        match = next((p for p in pool if _same_part(name, brand, p["name"], p.get("brand"))), None)
        if match is not None:
            before = match["quantity"]
            match["quantity"] += row.quantity
            new_part = " (created earlier in this import)" if match["id"] is None else ""
            adds.append(
                f"- row {index}: {name} -> adds {row.quantity} to {match['name']}{new_part}: "
                f"{before} -> {match['quantity']}"
            )
            continue
        category = _clean(row.category)
        if category and category.lower() not in category_names:
            unknown_categories.add(category)
        pool.append({"id": None, "name": name, "brand": brand, "quantity": row.quantity})
        detail = ", ".join(x for x in (_clean(row.type) or "Uncategorized", brand, category) if x)
        creates.append(f"- row {index}: NEW {name} ({detail}), quantity {row.quantity}")

    def section(title: str, items: list[str]) -> list[str]:
        if not items:
            return []
        out = ["", f"{title} ({len(items)}):", *items[:_SHOW]]
        if len(items) > _SHOW:
            out.append(f"  …and {len(items) - _SHOW} more")
        return out

    lines = [f"Inventory import preview: {source_name} ({len(rows)} row(s))"]
    lines += section("New parts to create", creates)
    lines += section("Existing parts that gain stock", adds)
    lines += section("Rows that will be skipped", skipped)
    if unknown_categories:
        lines.append("")
        lines.append(
            "These categories don't exist in PF-AIR, so those parts would be created "
            "uncategorized: " + ", ".join(sorted(unknown_categories))
        )
    if adds:
        lines.append("")
        lines.append(
            "Note: matching parts get these quantities ADDED to their current stock. If this "
            "sheet is a stock count (what's on the shelf now) rather than new arrivals, don't "
            "import it — set each part's stock with update_component instead."
        )
    if not creates and not adds:
        return "\n".join(lines + ["", "Nothing would be imported."])

    code = confirmations.issue(
        "inventory_import",
        {"source_name": source_name, "rows": [r.model_dump() for r in rows]},
    )
    lines.append("")
    lines.append(
        f'To import, call import_inventory(confirmation_code="{code}"). '
        f"The code works once and expires in {confirmations.CODE_TTL_SECONDS // 60} minutes."
    )
    return "\n".join(lines)


async def _import_inventory(confirmation_code: str) -> str:
    if error := confirmations.operator_missing():
        return error
    try:
        payload = confirmations.consume(confirmation_code, "inventory_import")
    except confirmations.ConfirmationError as exc:
        return str(exc)

    fields = ("name", "quantity", "type", "brand", "category", "description")
    rows = [
        {f: (None if row.get(f) is None else str(row[f])) for f in fields}
        for row in payload["rows"]
    ]
    result = await get_client().post(
        "/bulk-import/commit",
        json={
            "filename": payload["source_name"],
            "mapping": {f: f for f in fields},
            "rows": rows,
        },
    )

    lines = [
        f"Imported {payload['source_name']}: {result['created']} new part(s) created, "
        f"{len(result['updated'])} existing part(s) restocked."
    ]
    for u in result["updated"][:_SHOW]:
        lines.append(
            f"- {u['name']}: +{u['added_quantity']} "
            f"({u['previous_quantity']} -> {u['new_quantity']})"
        )
    if len(result["updated"]) > _SHOW:
        lines.append(f"  …and {len(result['updated']) - _SHOW} more")
    for s in result["skipped_rows"]:
        lines.append(f"Skipped row {s['row_index'] + 1}: {s['reason']}")
    for w in result["warnings"]:
        lines.append(f"Warning: {w}")
    return "\n".join(lines)


async def _update_component(component_ref: str, changes: dict[str, Any]) -> str:
    if error := confirmations.operator_missing():
        return error
    given = {k: v for k, v in changes.items() if v is not None}
    if not given:
        return "Nothing to change — pass at least one field."

    component, message = await resolve_component(component_ref)
    if component is None:
        return message or f"Couldn't find {component_ref!r}."

    body: dict[str, Any] = {}
    for key, value in given.items():
        if isinstance(value, str):
            value = value.strip()
            if key in ("name", "type") and not value:
                return f"A part's {key} can't be cleared."
            value = value or None
        if key in ("quantity", "low_stock_threshold") and value < 0:
            return f"{key} can't be negative."
        body[key] = value

    if "category" in body:
        name = body.pop("category")
        if name is None:
            body["category_id"] = None
        else:
            categories = await get_client().get("/categories")
            found = [c for c in categories if c["name"].strip().lower() == name.lower()]
            if not found:
                names = ", ".join(c["name"] for c in categories) or "none"
                return f"No category called {name!r}. Existing categories: {names}."
            body["category_id"] = found[0]["id"]

    after = await get_client().patch(f"/components/{component['id']}", json=body)

    lines = [f"Updated {after['name']} (id={after['id']}):"]
    for key in given:
        if key == "category":
            old = (component.get("category") or {}).get("name")
            new = (after.get("category") or {}).get("name")
        else:
            old, new = component.get(key), after.get(key)
        lines.append(
            f"- {key}: {old if old not in (None, '') else '(empty)'} -> "
            f"{new if new not in (None, '') else '(empty)'}"
        )
    return "\n".join(lines)


def register(mcp: MCPServer) -> None:
    @mcp.tool(annotations=READ_ONLY)
    async def preview_inventory_import(source_name: str, rows: list[InventoryRow]) -> str:
        """Preview adding parts to PF-AIR inventory, e.g. from a spreadsheet
        the user attached (read its rows and pass them here). Shows which
        parts would be created new and which existing parts would have the
        quantity ADDED to their stock. Changes nothing; returns a
        confirmation code for import_inventory.

        Use this for new arrivals / new parts. To set a part's stock to a
        counted number, use update_component instead — importing a stock
        count on top of existing stock would double it.

        Args:
            source_name: Name of the source, e.g. the attached file's name.
            rows: One entry per part: name, quantity to add, and optionally
                type, brand, category (an existing PF-AIR category) and
                description.
        """
        return await run_logged(
            "preview_inventory_import",
            {"source_name": source_name, "rows": len(rows)},
            lambda: _preview_inventory_import(source_name, rows),
        )

    @mcp.tool(annotations=WRITE_ADDITIVE)
    async def import_inventory(confirmation_code: str) -> str:
        """Import the inventory rows shown by preview_inventory_import.
        Creates new parts and adds stock to matching existing ones. Only
        call after the user has seen the preview and said go ahead.

        Args:
            confirmation_code: The code preview_inventory_import returned.
        """
        return await run_logged(
            "import_inventory",
            {"confirmation_code": confirmation_code, "operator": get_settings().operator_name},
            lambda: _import_inventory(confirmation_code),
            log_result=True,
        )

    @mcp.tool(annotations=WRITE_ADDITIVE)
    async def update_component(
        component: str,
        name: str | None = None,
        type: str | None = None,
        sku: str | None = None,
        brand: str | None = None,
        description: str | None = None,
        quantity: int | None = None,
        low_stock_threshold: int | None = None,
        category: str | None = None,
    ) -> str:
        """Edit one inventory part. Only the fields you pass change.
        `quantity` SETS the stock level (e.g. after a stock count) rather
        than adding to it. Pass "" to clear an optional text field or the
        category.

        Args:
            component: The part's exact name or id.
            name: New name.
            type: New type.
            sku: New internal SKU (must be unique).
            brand: New brand.
            description: New description.
            quantity: Stock on hand, as an absolute number.
            low_stock_threshold: Stock level at or below which it's "low".
            category: Existing PF-AIR category name.
        """
        changes = {
            "name": name,
            "type": type,
            "sku": sku,
            "brand": brand,
            "description": description,
            "quantity": quantity,
            "low_stock_threshold": low_stock_threshold,
            "category": category,
        }
        return await run_logged(
            "update_component",
            {
                "component": component,
                **{k: v for k, v in changes.items() if v is not None},
                "operator": get_settings().operator_name,
            },
            lambda: _update_component(component, changes),
            log_result=True,
        )
