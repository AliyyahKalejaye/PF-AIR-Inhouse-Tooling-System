"""search_components, get_component — wraps GET /components and
GET /components/{id} (see backend/app/api/routes/components.py)."""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

from pfair_mcp.client import get_client
from pfair_mcp.logging_setup import run_logged
from pfair_mcp.tools._format import READ_ONLY, component_line


async def _resolve_category_id(query: str) -> str | None:
    """GET /components only filters by category_id (a UUID), but a human
    (or the model) will ask for a category by name — "connectors",
    "fasteners". Fetch the category list and match case-insensitively
    against name or slug. Returns None if nothing matches, which the
    caller turns into a clear "no such category" message rather than
    silently ignoring the filter."""
    client = get_client()
    categories = await client.get("/categories")
    needle = query.strip().lower()
    for category in categories:
        if needle == category["name"].lower() or needle == category["slug"].lower():
            return category["id"]
    for category in categories:
        if needle in category["name"].lower():
            return category["id"]
    return None


async def _search_components(
    query: str | None, category: str | None, stock: str, limit: int
) -> str:
    client = get_client()

    category_id = None
    if category:
        category_id = await _resolve_category_id(category)
        if category_id is None:
            known = await client.get("/categories")
            names = ", ".join(c["name"] for c in known) or "(none configured)"
            return f"No category matching '{category}'. Known categories: {names}"

    params: dict[str, str | int] = {"stock": stock, "limit": limit}
    if query:
        params["q"] = query
    if category_id:
        params["category_id"] = category_id

    data = await client.get("/components", params=params)
    items = data["items"]
    if not items:
        return "No components matched that search."

    lines = [component_line(c) for c in items]
    stats = data["stats"]
    header = (
        f"Showing {len(items)} of {data['total']} matching components "
        f"(inventory-wide: {stats['total_skus']} SKUs, {stats['low_stock']} low stock, "
        f"{stats['out_of_stock']} out of stock)."
    )
    return "\n".join([header, *lines])


async def _get_component(component_id: str) -> str:
    client = get_client()
    c = await client.get(f"/components/{component_id}")
    category = c.get("category")
    if c["is_out_of_stock"]:
        status = "OUT OF STOCK"
    elif c["is_low_stock"]:
        status = "LOW STOCK"
    else:
        status = "in stock"
    lines = [
        f"{c['name']} (id={c['id']})",
        f"Type: {c['type']}" + (f" | Brand: {c['brand']}" if c.get("brand") else ""),
        f"SKU: {c['sku']}" if c.get("sku") else "SKU: (none)",
        f"Category: {category['name'] if category else 'uncategorized'}",
        f"Stock: {c['quantity']} on hand, low-stock threshold {c['low_stock_threshold']} "
        f"— currently {status}",
    ]
    if c.get("description"):
        lines.append(f"Description: {c['description']}")
    return "\n".join(lines)


def register(mcp: MCPServer) -> None:
    @mcp.tool(annotations=READ_ONLY)
    async def search_components(
        query: str | None = None,
        category: str | None = None,
        stock: str = "all",
        limit: int = 20,
    ) -> str:
        """Search PF-AIR's component inventory by free text (name, part
        number/SKU, brand, type, or description) and/or category name, and
        return their current stock levels.

        Args:
            query: Free-text search term — matches against name, SKU, brand,
                type, and description. Leave unset to browse without a
                search term (e.g. combined with `category` or `stock`).
            category: Category name to filter by (e.g. "Motors",
                "Fasteners"). Matched case-insensitively; a partial match is
                used if there's no exact one.
            stock: One of "all" (default), "low" (at or below the low-stock
                threshold but not zero), or "out" (zero on hand).
            limit: Max results to return, 1-200 (default 20).
        """
        return await run_logged(
            "search_components",
            {"query": query, "category": category, "stock": stock, "limit": limit},
            lambda: _search_components(query, category, stock, limit),
        )

    @mcp.tool(annotations=READ_ONLY)
    async def get_component(component_id: str) -> str:
        """Get full details for one inventory component by its id,
        including stock level, SKU, brand, category, and description.

        Args:
            component_id: The component's UUID (from search_components or
                another tool's output).
        """
        return await run_logged(
            "get_component",
            {"component_id": component_id},
            lambda: _get_component(component_id),
        )
