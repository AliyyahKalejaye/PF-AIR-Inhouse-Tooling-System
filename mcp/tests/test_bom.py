from __future__ import annotations

import base64

import httpx

from pfair_mcp.tools.bom import _check_bom
from tests.conftest import API_BASE, make_component


def _bom_response(bom_id: str, items: list[dict]) -> dict:
    available = sum(1 for i in items if i["status"] == "available")
    low_stock = sum(1 for i in items if i["status"] == "low_stock")
    missing = sum(1 for i in items if i["status"] == "missing")
    return {
        "bom_id": bom_id,
        "filename": "zd550_bom.csv",
        "items": items,
        "summary": {"available": available, "low_stock": low_stock, "missing": missing},
    }


async def test_check_bom_reports_shortages(respx_mock, mock_login) -> None:
    matched = make_component(name="Frame Arm", quantity=2)
    items = [
        {
            "id": "a1111111-1111-1111-1111-111111111111",
            "raw_name": "Frame Arm",
            "quantity_requested": 4,
            "status": "low_stock",
            "matched_component": matched,
            "suggested_component": None,
            "suggested_match_score": None,
        },
        {
            "id": "a2222222-2222-2222-2222-222222222222",
            "raw_name": "Exotic Capacitor 999uF",
            "quantity_requested": 1,
            "status": "missing",
            "matched_component": None,
            "suggested_component": None,
            "suggested_match_score": None,
        },
        {
            "id": "a3333333-3333-3333-3333-333333333333",
            "raw_name": "Prop Nut",
            "quantity_requested": 4,
            "status": "available",
            "matched_component": make_component(name="Prop Nut", quantity=50),
            "suggested_component": None,
            "suggested_match_score": None,
        },
    ]
    route = respx_mock.post(f"{API_BASE}/bom/check").mock(
        return_value=httpx.Response(200, json=_bom_response("bom-1", items)),
    )

    content = base64.b64encode(b"raw_name,qty\nFrame Arm,4\n").decode()
    result = await _check_bom("zd550_bom.csv", content)

    assert route.called
    assert "1 available, 1 low stock, 1 missing" in result
    assert "Frame Arm: need 4, only 2 in stock (short by 2)" in result
    assert "Exotic Capacitor 999uF: need 1, NOT FOUND in inventory" in result
    # fully-available item shouldn't show up in the short/missing section
    assert "Prop Nut" not in result.split("Short or missing items:")[1]


async def test_check_bom_everything_available(respx_mock, mock_login) -> None:
    items = [
        {
            "id": "a1111111-1111-1111-1111-111111111111",
            "raw_name": "Prop Nut",
            "quantity_requested": 4,
            "status": "available",
            "matched_component": make_component(name="Prop Nut", quantity=50),
            "suggested_component": None,
            "suggested_match_score": None,
        }
    ]
    respx_mock.post(f"{API_BASE}/bom/check").mock(
        return_value=httpx.Response(200, json=_bom_response("bom-2", items))
    )
    content = base64.b64encode(b"raw_name,qty\nProp Nut,4\n").decode()
    result = await _check_bom("bom.csv", content)
    assert "Everything on this BOM is fully available." in result


async def test_check_bom_invalid_base64_returns_clear_message() -> None:
    result = await _check_bom("bom.csv", "not-valid-base64!!!")
    assert "valid base64" in result


async def test_check_bom_suggests_closest_match_when_missing(respx_mock, mock_login) -> None:
    suggestion = make_component(name="Similar Capacitor 1000uF")
    items = [
        {
            "id": "a1111111-1111-1111-1111-111111111111",
            "raw_name": "Exotic Capacitor 999uF",
            "quantity_requested": 1,
            "status": "missing",
            "matched_component": None,
            "suggested_component": suggestion,
            "suggested_match_score": 0.82,
        }
    ]
    respx_mock.post(f"{API_BASE}/bom/check").mock(
        return_value=httpx.Response(200, json=_bom_response("bom-3", items))
    )
    content = base64.b64encode(b"raw_name,qty\nExotic Capacitor 999uF,1\n").decode()
    result = await _check_bom("bom.csv", content)
    assert "closest match: Similar Capacitor 1000uF, score 0.82" in result
