"""Shared formatting helpers so components/bom/projects don't each
re-invent "how do I describe a component's stock level in one line"."""

from __future__ import annotations

from typing import Any


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
