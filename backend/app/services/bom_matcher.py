"""Matches BOM (Bill of Materials) line items against real inventory.

Uses fuzzy string matching (rapidfuzz) rather than the embedding-based
nearest-neighbor search described in the original component.py comment —
see app/schemas/inventory.py's module docstring for why real semantic
matching is deferred. Fuzzy name matching gets the same three-bucket
result (available / low_stock / missing) with a genuine match score, using
a fast, dependency-light library instead of a GPU-hungry model.
"""

import uuid
from dataclasses import dataclass

from rapidfuzz import fuzz, process

from app.models.component import Component

# A BOM line is considered "confidently the same part" at this score;
# below it we treat the part as not found and fall back to suggesting the
# closest in-stock alternative instead.
MATCH_THRESHOLD = 80.0
# Below this, a candidate isn't even worth suggesting as a substitute.
SUGGEST_THRESHOLD = 55.0


@dataclass
class BOMLineResult:
    raw_name: str
    quantity_requested: int
    status: str  # "available" | "low_stock" | "missing"
    matched_component_id: uuid.UUID | None
    suggested_component_id: uuid.UUID | None
    suggested_match_score: float | None  # 0.0-1.0


def _suggest_substitute(
    raw_name: str, components: list[Component], exclude_id: uuid.UUID | None
) -> tuple[uuid.UUID | None, float | None]:
    candidates = {c.id: c.name for c in components if c.quantity > 0 and c.id != exclude_id}
    if not candidates:
        return None, None
    match = process.extractOne(
        raw_name, candidates, scorer=fuzz.WRatio, score_cutoff=SUGGEST_THRESHOLD
    )
    if match is None:
        return None, None
    _matched_name, score, matched_id = match
    return matched_id, round(score / 100.0, 2)


def match_bom_line(
    raw_name: str, quantity_requested: int, components: list[Component]
) -> BOMLineResult:
    choices = {c.id: c.name for c in components}
    best = (
        process.extractOne(raw_name, choices, scorer=fuzz.WRatio, score_cutoff=MATCH_THRESHOLD)
        if choices
        else None
    )

    if best is None:
        suggested_id, suggested_score = _suggest_substitute(raw_name, components, exclude_id=None)
        return BOMLineResult(
            raw_name=raw_name,
            quantity_requested=quantity_requested,
            status="missing",
            matched_component_id=None,
            suggested_component_id=suggested_id,
            suggested_match_score=suggested_score,
        )

    _matched_name, _score, matched_id = best
    matched = next(c for c in components if c.id == matched_id)

    if matched.quantity <= 0:
        suggested_id, suggested_score = _suggest_substitute(
            raw_name, components, exclude_id=matched.id
        )
        return BOMLineResult(
            raw_name=raw_name,
            quantity_requested=quantity_requested,
            status="missing",
            matched_component_id=matched.id,
            suggested_component_id=suggested_id,
            suggested_match_score=suggested_score,
        )

    if matched.quantity < quantity_requested or matched.quantity <= matched.low_stock_threshold:
        return BOMLineResult(
            raw_name=raw_name,
            quantity_requested=quantity_requested,
            status="low_stock",
            matched_component_id=matched.id,
            suggested_component_id=None,
            suggested_match_score=None,
        )

    return BOMLineResult(
        raw_name=raw_name,
        quantity_requested=quantity_requested,
        status="available",
        matched_component_id=matched.id,
        suggested_component_id=None,
        suggested_match_score=None,
    )


# --- Extracting (name, quantity) pairs out of an uploaded BOM spreadsheet ---

_NAME_ALIASES = ["name", "part", "part name", "component", "item", "description"]
_QTY_ALIASES = ["qty", "quantity", "qty requested", "quantity requested", "count", "amount"]


def _find_column(columns: list[str], aliases: list[str]) -> str | None:
    normalized = {c: c.strip().lower() for c in columns}
    for col, norm in normalized.items():
        if norm in aliases:
            return col
    # Fuzzy fallback for near-miss headers like "Qty." or "Part Name ".
    best_col: str | None = None
    best_score = 0.0
    for alias in aliases:
        m = process.extractOne(alias, columns, scorer=fuzz.token_sort_ratio, score_cutoff=70)
        if m and m[1] > best_score:
            best_col, best_score = m[0], m[1]
    return best_col


def extract_bom_lines(
    rows: list[dict[str, str | None]], columns: list[str]
) -> list[tuple[str, int]]:
    """Best-effort extraction of (raw_name, quantity_requested) pairs from
    an arbitrary BOM spreadsheet — these are typically a plain two-column
    "part / qty" export with no fixed template, so this is heuristic by
    necessity rather than a strict schema.
    """
    if not columns:
        return []

    name_col = _find_column(columns, _NAME_ALIASES) or columns[0]
    qty_col = _find_column(columns, _QTY_ALIASES)
    if qty_col is None and len(columns) > 1:
        second_col = next((c for c in columns if c != name_col), None)
        if second_col and all(
            (row.get(second_col) is None or _is_intlike(row.get(second_col))) for row in rows
        ):
            qty_col = second_col

    lines: list[tuple[str, int]] = []
    for row in rows:
        raw_name = row.get(name_col)
        if not raw_name:
            continue
        qty_raw = row.get(qty_col) if qty_col else None
        try:
            qty = int(float(qty_raw)) if qty_raw else 1
        except ValueError:
            qty = 1
        lines.append((raw_name, max(qty, 1)))
    return lines


def _is_intlike(value: str | None) -> bool:
    if value is None:
        return True
    try:
        float(value)
        return True
    except ValueError:
        return False
