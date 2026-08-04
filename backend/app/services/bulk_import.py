"""Column auto-mapping + commit logic for the Inventory bulk-import wizard
(the "map your spreadsheet columns to inventory fields" screen).
"""

import re
import uuid

from rapidfuzz import fuzz, process
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.component import Category, Component
from app.schemas.inventory import BULK_IMPORT_TARGET_FIELDS, BulkImportColumn
from app.services.notifications import notify_on_stock_change

# Header aliases per target field — matched exactly (case-insensitive)
# first, then by fuzzy score as a fallback for near-misses like "Qty on
# Hand" or "Img Link". `sku` is deliberately not a target — see
# BULK_IMPORT_TARGET_FIELDS' docstring in app/schemas/inventory.py.
_FIELD_ALIASES: dict[str, list[str]] = {
    "name": ["name", "part name", "component name", "item name", "product name"],
    "type": ["type", "part type", "component type"],
    "category": ["category", "cat", "cat."],
    "brand": ["brand", "manufacturer", "mfr", "make"],
    "description": ["description", "desc", "notes", "remarks"],
    "quantity": ["quantity", "qty", "qty on hand", "quantity on hand", "stock", "count"],
    "image_url": ["image url", "image", "img", "img link", "photo", "picture"],
}

AUTO_MATCH_THRESHOLD = 75.0

# Parts repeat across BOMs/inventory sheets constantly — this dedups a
# bulk-import row against an existing component (by name + brand) instead
# of creating a near-duplicate every time the same part gets re-uploaded.
#
# Deliberately NOT edit-distance/fuzzy-scored, unlike bom_matcher.py's
# MATCH_THRESHOLD. A BOM match only *suggests* a component for a human to
# confirm; this one silently adds to a real component's stock count with
# no human in the loop. Ordinary fuzzy scorers rate "Widget A" vs
# "Widget B", or "M3x10 Screw" vs "M3x12 Screw", as highly similar —
# they're mostly identical text — even though the differing character is
# exactly what makes them different physical parts. So matching here is
# normalized-exact instead: strip whitespace/punctuation/case (catching
# "ESC 30A" vs "ESC-30A" vs "esc30a") and require what's left to be
# identical. A genuine rewording ("M3 x 10mm Screw" vs "M3x10 Screw")
# won't match and creates a small duplicate instead — an occasional extra
# row a human can merge is a far better failure mode than silently
# combining two different parts' stock counts.
def _normalize_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def _same_part(name_a: str, brand_a: str | None, name_b: str, brand_b: str | None) -> bool:
    if _normalize_key(name_a) != _normalize_key(name_b):
        return False
    # Brand only disqualifies a match when *both* sides specify one and
    # they differ — a row with no brand column still matches an existing
    # branded component by name alone, since many import sheets never
    # carry brand at all.
    brand_key_a, brand_key_b = _normalize_key(brand_a), _normalize_key(brand_b)
    if brand_key_a and brand_key_b and brand_key_a != brand_key_b:
        return False
    return True


def _best_field_for_header(header: str) -> str | None:
    normalized = header.strip().lower()
    for field, aliases in _FIELD_ALIASES.items():
        if normalized in aliases:
            return field

    best_field: str | None = None
    best_score = 0.0
    for field, aliases in _FIELD_ALIASES.items():
        match = process.extractOne(normalized, aliases, scorer=fuzz.token_sort_ratio)
        if match and match[1] > best_score:
            best_field, best_score = field, match[1]
    return best_field if best_score >= AUTO_MATCH_THRESHOLD else None


def auto_map_columns(
    columns: list[str], rows: list[dict[str, str | None]]
) -> list[BulkImportColumn]:
    used_fields: set[str] = set()
    mapped: list[BulkImportColumn] = []

    for col in columns:
        sample = next((row.get(col) for row in rows if row.get(col)), None)
        field = _best_field_for_header(col)
        # First column claiming a target field wins it; later columns that
        # would also fuzzy-match the same field fall back to unmapped
        # rather than silently overwriting each other on commit.
        if field is not None and field in used_fields:
            field = None
        if field is not None:
            used_fields.add(field)
        mapped.append(
            BulkImportColumn(
                source_column=col,
                sample=sample,
                mapped_field=field,
                status="auto" if field else "manual",
            )
        )
    return mapped


async def commit_bulk_import(
    db: AsyncSession,
    *,
    mapping: dict[str, str],
    rows: list[dict[str, str | None]],
    created_by: uuid.UUID,
) -> tuple[int, list[tuple[int, uuid.UUID, str, int, int, int]], list[tuple[int, str]], list[str]]:
    """Returns (created_count, updated_rows, skipped_rows, warnings).

    updated_rows is (row_index, component_id, name, previous_quantity,
    added_quantity, new_quantity) — a row that matched (see _same_part)
    an existing component gets its quantity *added* to that component's
    stock rather than creating a duplicate row.
    """
    categories = list((await db.execute(select(Category))).scalars().all())
    category_by_name = {c.name.strip().lower(): c for c in categories}

    existing_components = list((await db.execute(select(Component))).scalars().all())
    # Every component a row can match against — existing ones, plus
    # anything created earlier in *this same* import (a list, not a dict,
    # since matching is now a linear _same_part scan rather than a
    # rapidfuzz lookup keyed by string).
    match_pool: list[Component] = list(existing_components)

    reverse_mapping = {
        target: source
        for source, target in mapping.items()
        if target in BULK_IMPORT_TARGET_FIELDS
    }

    def field_value(row: dict[str, str | None], field: str) -> str | None:
        col = reverse_mapping.get(field)
        return row.get(col) if col else None

    created = 0
    updated: list[tuple[int, uuid.UUID, str, int, int, int]] = []
    skipped: list[tuple[int, str]] = []
    warnings: list[str] = []
    unresolved_categories: set[str] = set()

    for index, row in enumerate(rows):
        name = field_value(row, "name")
        if not name:
            skipped.append((index, "Missing a component name."))
            continue

        quantity = 0
        qty_raw = field_value(row, "quantity")
        if qty_raw:
            try:
                quantity = max(int(float(qty_raw)), 0)
            except (TypeError, ValueError):
                warnings.append(
                    f"Row {index + 1}: quantity '{qty_raw}' wasn't a number — set to 0."
                )

        brand = field_value(row, "brand")

        component = next(
            (c for c in match_pool if _same_part(name, brand, c.name, c.brand)), None
        )

        if component is not None:
            previous_quantity = component.quantity
            component.quantity += quantity
            await notify_on_stock_change(db, component, previous_quantity)
            updated.append(
                (
                    index,
                    component.id,
                    component.name,
                    previous_quantity,
                    quantity,
                    component.quantity,
                )
            )
            continue

        category_id = None
        cat_raw = field_value(row, "category")
        if cat_raw:
            category = category_by_name.get(cat_raw.strip().lower())
            if category is not None:
                category_id = category.id
            else:
                unresolved_categories.add(cat_raw)

        component = Component(
            name=name,
            type=field_value(row, "type") or "Uncategorized",
            brand=brand,
            description=field_value(row, "description"),
            quantity=quantity,
            image_url=field_value(row, "image_url"),
            category_id=category_id,
            created_by=created_by,
        )
        db.add(component)
        await db.flush()  # populate component.id so later rows can match against it
        created += 1

        # Register so later rows in this same file can match against it
        # too, instead of each creating its own duplicate.
        match_pool.append(component)

    if unresolved_categories:
        warnings.append(
            "Categories not found in the system (components created uncategorized): "
            + ", ".join(sorted(unresolved_categories))
        )

    await db.commit()
    return created, updated, skipped, warnings
