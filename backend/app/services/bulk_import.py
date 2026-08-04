"""Column auto-mapping + commit logic for the Inventory bulk-import wizard
(the "map your spreadsheet columns to inventory fields" screen).
"""

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
# Higher than bom_matcher's MATCH_THRESHOLD (80) because a BOM match only
# *suggests* a component for a human to confirm, while this one silently
# writes to inventory — a false match here quietly corrupts a real
# component's stock count, so it's worth erring toward creating an
# occasional duplicate over merging two different parts.
DEDUP_MATCH_THRESHOLD = 87.0


def _dedup_key(name: str, brand: str | None) -> str:
    """A row with no brand will match a same-named component that *does*
    have a brand a little more loosely than an exact brand-to-brand
    match would — WRatio tolerates the extra token, just with a lower
    score. That's the accepted tradeoff for matching on name+brand rather
    than name alone (see the recommendation this threshold was chosen
    against)."""
    return f"{name.strip().lower()} {(brand or '').strip().lower()}".strip()


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
    added_quantity, new_quantity) — a row that fuzzy-matched an existing
    component gets its quantity *added* to that component's stock rather
    than creating a duplicate row.
    """
    categories = list((await db.execute(select(Category))).scalars().all())
    category_by_name = {c.name.strip().lower(): c for c in categories}

    existing_components = list((await db.execute(select(Component))).scalars().all())
    # Every component a row can match against, keyed by a string id —
    # real components use their UUID; components created earlier in *this
    # same* import use a synthetic "new:<row index>" key, so duplicate
    # rows within one file merge into each other too instead of each
    # creating its own near-duplicate.
    match_pool: dict[str, Component] = {str(c.id): c for c in existing_components}
    match_keys: dict[str, str] = {
        key: _dedup_key(c.name, c.brand) for key, c in match_pool.items()
    }

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

        match_id: str | None = None
        if match_keys:
            best = process.extractOne(
                _dedup_key(name, brand),
                match_keys,
                scorer=fuzz.WRatio,
                score_cutoff=DEDUP_MATCH_THRESHOLD,
            )
            if best is not None:
                _matched_key, _score, match_id = best

        if match_id is not None:
            component = match_pool[match_id]
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

        temp_key = f"new:{index}"
        match_pool[temp_key] = component
        match_keys[temp_key] = _dedup_key(name, brand)

    if unresolved_categories:
        warnings.append(
            "Categories not found in the system (components created uncategorized): "
            + ", ".join(sorted(unresolved_categories))
        )

    await db.commit()
    return created, updated, skipped, warnings
