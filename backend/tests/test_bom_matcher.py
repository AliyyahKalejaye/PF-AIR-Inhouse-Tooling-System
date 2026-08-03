"""Unit tests for app/services/bom_matcher.py — pure functions, no DB or
HTTP client needed, so these run fast and don't depend on Postgres being
reachable at all (unlike most of this test suite — see conftest.py's
module docstring)."""

import uuid

from app.models.component import Component
from app.services.bom_matcher import extract_bom_lines, match_bom_line


def _component(name: str, quantity: int, low_stock_threshold: int = 10) -> Component:
    # UUIDPkMixin's `id` column default (uuid.uuid4) only applies on
    # INSERT — an in-memory instance built without a session needs its id
    # set explicitly, since match_bom_line keys its fuzzy-match choices
    # dict by component.id.
    return Component(
        id=uuid.uuid4(),
        name=name,
        type="Test",
        quantity=quantity,
        low_stock_threshold=low_stock_threshold,
    )


def test_match_bom_line_available_for_well_stocked_exact_name() -> None:
    widget = _component("Widget A", quantity=50)
    result = match_bom_line("Widget A", 2, [widget])

    assert result.status == "available"
    assert result.matched_component_id == widget.id
    assert result.suggested_component_id is None


def test_match_bom_line_low_stock_when_requested_exceeds_available() -> None:
    widget = _component("Widget A", quantity=1)
    result = match_bom_line("Widget A", 5, [widget])

    assert result.status == "low_stock"
    assert result.matched_component_id == widget.id


def test_match_bom_line_low_stock_when_at_or_below_threshold() -> None:
    widget = _component("Widget A", quantity=3, low_stock_threshold=5)
    result = match_bom_line("Widget A", 1, [widget])

    assert result.status == "low_stock"
    assert result.matched_component_id == widget.id


def test_match_bom_line_missing_when_out_of_stock_suggests_substitute() -> None:
    out_of_stock = _component("Widget A", quantity=0)
    substitute = _component("Widget A2", quantity=10)
    result = match_bom_line("Widget A", 1, [out_of_stock, substitute])

    assert result.status == "missing"
    assert result.matched_component_id == out_of_stock.id
    assert result.suggested_component_id == substitute.id
    assert result.suggested_match_score is not None
    assert 0.0 <= result.suggested_match_score <= 1.0


def test_match_bom_line_missing_with_no_inventory_at_all() -> None:
    result = match_bom_line("Nonexistent Part", 1, [])

    assert result.status == "missing"
    assert result.matched_component_id is None
    assert result.suggested_component_id is None
    assert result.suggested_match_score is None


def test_match_bom_line_no_confident_match_falls_back_to_missing() -> None:
    unrelated = _component("Completely Different Thing", quantity=10)
    result = match_bom_line("Widget A", 1, [unrelated])

    assert result.status == "missing"
    assert result.matched_component_id is None


def test_extract_bom_lines_finds_name_and_qty_by_header_alias() -> None:
    rows = [
        {"Part Name": "Widget A", "Qty": "2"},
        {"Part Name": "Widget B", "Qty": "5"},
    ]
    lines = extract_bom_lines(rows, ["Part Name", "Qty"])

    assert lines == [("Widget A", 2), ("Widget B", 5)]


def test_extract_bom_lines_defaults_missing_qty_to_one() -> None:
    rows = [{"Part Name": "Widget A", "Qty": None}]
    lines = extract_bom_lines(rows, ["Part Name", "Qty"])

    assert lines == [("Widget A", 1)]


def test_extract_bom_lines_skips_rows_without_a_name() -> None:
    rows = [{"Part Name": None, "Qty": "3"}, {"Part Name": "Widget A", "Qty": "3"}]
    lines = extract_bom_lines(rows, ["Part Name", "Qty"])

    assert lines == [("Widget A", 3)]


def test_extract_bom_lines_empty_columns_returns_no_lines() -> None:
    assert extract_bom_lines([{"a": "b"}], []) == []


def test_extract_bom_lines_non_numeric_qty_defaults_to_one() -> None:
    rows = [{"Part Name": "Widget A", "Qty": "lots"}]
    lines = extract_bom_lines(rows, ["Part Name", "Qty"])

    assert lines == [("Widget A", 1)]
