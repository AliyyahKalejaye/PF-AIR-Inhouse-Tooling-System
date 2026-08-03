"""Unit tests for app/services/bulk_import.py's auto_map_columns — pure
function, no DB needed (commit_bulk_import itself is covered indirectly
via tests/test_bulk_import_routes.py's /bulk-import/commit tests, since it
needs a real session to look up categories)."""

from app.services.bulk_import import auto_map_columns


def test_auto_map_columns_matches_exact_aliases() -> None:
    columns = ["Name", "Type", "Brand", "Qty on Hand"]
    rows = [{"Name": "Widget A", "Type": "Motor", "Brand": "Acme", "Qty on Hand": "10"}]

    mapped = auto_map_columns(columns, rows)
    by_column = {c.source_column: c for c in mapped}

    assert by_column["Name"].mapped_field == "name"
    assert by_column["Name"].status == "auto"
    assert by_column["Type"].mapped_field == "type"
    assert by_column["Brand"].mapped_field == "brand"
    assert by_column["Qty on Hand"].mapped_field == "quantity"


def test_auto_map_columns_unrecognized_header_is_manual() -> None:
    columns = ["Some Random Header"]
    rows = [{"Some Random Header": "??"}]

    mapped = auto_map_columns(columns, rows)

    assert mapped[0].mapped_field is None
    assert mapped[0].status == "manual"


def test_auto_map_columns_second_column_claiming_same_field_falls_back_to_manual() -> None:
    # Both headers would fuzzy-match "name" — only the first column should
    # win it; the second must not silently overwrite it on commit.
    columns = ["Name", "Component Name"]
    rows = [{"Name": "Widget A", "Component Name": "Widget A (dup)"}]

    mapped = auto_map_columns(columns, rows)

    assert mapped[0].mapped_field == "name"
    assert mapped[1].mapped_field is None
    assert mapped[1].status == "manual"


def test_auto_map_columns_captures_first_non_empty_sample() -> None:
    columns = ["Name"]
    rows = [{"Name": None}, {"Name": ""}, {"Name": "Widget A"}]

    mapped = auto_map_columns(columns, rows)

    assert mapped[0].sample == "Widget A"


def test_auto_map_columns_empty_input() -> None:
    assert auto_map_columns([], []) == []
