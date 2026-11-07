from __future__ import annotations

import json
import re

import httpx

from pfair_mcp.tools.inventory_write import (
    InventoryRow,
    _import_inventory,
    _preview_inventory_import,
    _update_component,
)
from tests.conftest import API_BASE, make_category, make_component

MOTORS = make_category(name="Motors", slug="motors")
MOTOR = make_component(name="ESC 30A", brand="Hobbywing", quantity=10, category=MOTORS)
NO_BRAND = make_component(name="Prop Nut", brand=None, quantity=50)


def _code(text: str) -> str:
    match = re.search(r'confirmation_code="([^"]+)"', text)
    assert match, text
    return match.group(1)


def _mock(respx_mock, components=(MOTOR, NO_BRAND)):
    components = list(components)

    def page(request: httpx.Request) -> httpx.Response:
        q = (request.url.params.get("q") or "").lower()
        offset = int(request.url.params.get("offset") or 0)
        hits = [c for c in components if q in c["name"].lower()]
        return httpx.Response(
            200,
            json={
                "items": hits[offset : offset + 200],
                "total": len(hits),
                "limit": 200,
                "offset": offset,
                "stats": {},
            },
        )

    respx_mock.get(f"{API_BASE}/components").mock(side_effect=page)
    for c in components:
        respx_mock.get(f"{API_BASE}/components/{c['id']}").mock(
            return_value=httpx.Response(200, json=c)
        )
    respx_mock.get(f"{API_BASE}/categories").mock(return_value=httpx.Response(200, json=[MOTORS]))


async def test_preview_predicts_backend_matching(respx_mock, mock_login) -> None:
    _mock(respx_mock)
    rows = [
        InventoryRow(name="esc-30a", brand="HOBBYWING", quantity=5),  # same part, adds
        InventoryRow(name="ESC 30A", brand="T-Motor", quantity=2),  # brands differ: new
        InventoryRow(name="Prop Nut", brand="Gemfan", quantity=20),  # existing has no brand
        InventoryRow(name="Carbon Arm", quantity=8, category="Frames"),  # new, unknown cat
        InventoryRow(name="carbon arm", quantity=4),  # matches the row above
        InventoryRow(name="  ", quantity=1),
    ]

    preview = await _preview_inventory_import("arrivals.xlsx", rows)

    assert "row 1: esc-30a -> adds 5 to ESC 30A: 10 -> 15" in preview
    assert "row 2: NEW ESC 30A (Uncategorized, T-Motor), quantity 2" in preview
    assert "row 3: Prop Nut -> adds 20 to Prop Nut: 50 -> 70" in preview
    assert "row 4: NEW Carbon Arm (Uncategorized, Frames), quantity 8" in preview
    assert (
        "row 5: carbon arm -> adds 4 to Carbon Arm (created earlier in this import): 8 -> 12"
        in preview
    )
    assert "row 6: no part name" in preview
    assert "created uncategorized: Frames" in preview
    assert "ADDED to their current stock" in preview


async def test_import_commits_rows_as_strings_with_identity_mapping(respx_mock, mock_login) -> None:
    _mock(respx_mock)
    commit = respx_mock.post(f"{API_BASE}/bulk-import/commit").mock(
        return_value=httpx.Response(
            201,
            json={
                "created": 1,
                "updated": [
                    {
                        "row_index": 0,
                        "component_id": MOTOR["id"],
                        "name": "ESC 30A",
                        "previous_quantity": 10,
                        "added_quantity": 5,
                        "new_quantity": 15,
                    }
                ],
                "skipped_rows": [],
                "warnings": [],
            },
        )
    )
    preview = await _preview_inventory_import(
        "arrivals.xlsx",
        [
            InventoryRow(name="ESC 30A", quantity=5),
            InventoryRow(name="GPS M10", quantity=3, type="GPS"),
        ],
    )

    result = await _import_inventory(_code(preview))

    body = json.loads(commit.calls[0].request.content)
    assert body["filename"] == "arrivals.xlsx"
    assert body["mapping"] == {
        f: f for f in ("name", "quantity", "type", "brand", "category", "description")
    }
    assert body["rows"][1] == {
        "name": "GPS M10",
        "quantity": "3",
        "type": "GPS",
        "brand": None,
        "category": None,
        "description": None,
    }
    assert "1 new part(s) created, 1 existing part(s) restocked" in result
    assert "ESC 30A: +5 (10 -> 15)" in result
    assert "isn't valid" in await _import_inventory(_code(preview))


async def test_update_component_sets_quantity_and_category(respx_mock, mock_login) -> None:
    _mock(respx_mock)
    after = {**NO_BRAND, "quantity": 42, "category": MOTORS}
    patch = respx_mock.patch(f"{API_BASE}/components/{NO_BRAND['id']}").mock(
        return_value=httpx.Response(200, json=after)
    )

    result = await _update_component("prop nut", {"quantity": 42, "category": "motors"})

    assert json.loads(patch.calls[0].request.content) == {
        "quantity": 42,
        "category_id": MOTORS["id"],
    }
    assert "quantity: 50 -> 42" in result


async def test_update_component_unknown_category(respx_mock, mock_login) -> None:
    _mock(respx_mock)
    patch = respx_mock.patch(url__regex=rf"{API_BASE}/components/.*")
    result = await _update_component(MOTOR["id"], {"category": "Frames"})
    assert "No category called 'Frames'" in result
    assert not patch.called


async def test_inventory_paging_reads_every_page(respx_mock, mock_login) -> None:
    many = [make_component(name=f"Part {i}", quantity=1) for i in range(450)]
    _mock(respx_mock, components=many)
    preview = await _preview_inventory_import("x.csv", [InventoryRow(name="Part 449", quantity=1)])
    assert "adds 1 to Part 449: 1 -> 2" in preview
