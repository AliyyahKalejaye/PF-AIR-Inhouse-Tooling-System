from __future__ import annotations

import re

import httpx
import pytest

import pfair_mcp.config as config_module
from pfair_mcp.tools.bom import _preview_bom_reservation, _reserve_bom
from tests.conftest import API_BASE, make_component

BOM_ID = "b0000000-0000-0000-0000-000000000001"


def _item(raw_name: str, qty: int, status: str, component: dict | None) -> dict:
    return {
        "id": f"i-{raw_name}",
        "raw_name": raw_name,
        "quantity_requested": qty,
        "status": status,
        "matched_component": component,
        "suggested_component": None,
        "suggested_match_score": None,
    }


@pytest.fixture
def motor() -> dict:
    return make_component(name="Brushless Motor", quantity=14)


@pytest.fixture
def checked_bom(motor: dict) -> dict:
    """Seeds the in-process cache as if check_bom had just run."""
    from pfair_mcp.tools import bom

    data = {
        "bom_id": BOM_ID,
        "filename": "vtol.csv",
        "items": [
            _item("Brushless Motor", 4, "available", motor),
            _item("Unobtainium Bolt", 2, "missing", None),
        ],
        "summary": {"available": 1, "low_stock": 0, "missing": 1},
    }
    bom._checked_boms[BOM_ID] = data
    return data


def _code(text: str) -> str:
    match = re.search(r'confirmation_code="([^"]+)"', text)
    assert match, text
    return match.group(1)


def _mock_stock(respx_mock, component: dict, *quantities: int):
    return respx_mock.get(f"{API_BASE}/components/{component['id']}").mock(
        side_effect=[httpx.Response(200, json={**component, "quantity": q}) for q in quantities]
    )


async def test_preview_shows_deductions_and_skips_without_writing(
    respx_mock, mock_login, checked_bom, motor
) -> None:
    _mock_stock(respx_mock, motor, 14)
    reserve = respx_mock.post(f"{API_BASE}/bom/{BOM_ID}/reserve")

    result = await _preview_bom_reservation(BOM_ID)

    assert "Brushless Motor: take 4, 14 -> 10 left" in result
    assert "Unobtainium Bolt (not found in inventory)" in result
    assert "can't be undone" in result
    assert _code(result).startswith("BOM-")
    assert not reserve.called


async def test_reserve_with_code_deducts_exactly_once(
    respx_mock, mock_login, checked_bom, motor
) -> None:
    _mock_stock(respx_mock, motor, 14, 14)
    reserve = respx_mock.post(f"{API_BASE}/bom/{BOM_ID}/reserve").mock(
        return_value=httpx.Response(
            200,
            json={
                "bom_id": BOM_ID,
                "reserved": [
                    {
                        "component_id": motor["id"],
                        "name": "Brushless Motor",
                        "quantity_deducted": 4,
                        "remaining_quantity": 10,
                    }
                ],
                "skipped": [
                    {"bom_item_id": "x", "raw_name": "Unobtainium Bolt", "reason": "No match."}
                ],
            },
        )
    )
    code = _code(await _preview_bom_reservation(BOM_ID))

    result = await _reserve_bom(code)
    assert reserve.call_count == 1
    assert "Brushless Motor: -4, 10 left" in result
    assert "on behalf of Test Operator" in result

    # Single use: the same code can't reserve a second time.
    again = await _reserve_bom(code)
    assert "isn't valid" in again
    assert reserve.call_count == 1


async def test_preview_refuses_when_stock_dropped_since_check(
    respx_mock, mock_login, checked_bom, motor
) -> None:
    _mock_stock(respx_mock, motor, 3)  # BOM needs 4

    result = await _preview_bom_reservation(BOM_ID)

    assert "Can't reserve" in result
    assert "need 4, only 3 in stock now" in result
    assert "confirmation_code" not in result


async def test_reserve_refuses_when_stock_moved_after_preview(
    respx_mock, mock_login, checked_bom, motor
) -> None:
    _mock_stock(respx_mock, motor, 14, 9)
    reserve = respx_mock.post(f"{API_BASE}/bom/{BOM_ID}/reserve")
    code = _code(await _preview_bom_reservation(BOM_ID))

    result = await _reserve_bom(code)

    assert "Not reserved" in result
    assert "14 at preview, 9 now" in result
    assert not reserve.called


async def test_unknown_bom_asks_for_recheck(respx_mock, mock_login) -> None:
    result = await _preview_bom_reservation("never-checked")
    assert "Run check_bom" in result


async def test_made_up_code_is_refused(respx_mock, mock_login) -> None:
    reserve = respx_mock.post(url__regex=rf"{API_BASE}/bom/.*/reserve")
    result = await _reserve_bom("BOM-123456")
    assert "isn't valid" in result
    assert not reserve.called


async def test_ecr_code_cannot_reserve_a_bom(respx_mock, mock_login) -> None:
    from pfair_mcp import confirmations

    code = confirmations.issue("ecr_submit", {"title": "x"})
    result = await _reserve_bom(code)
    assert "different kind of action" in result


async def test_writes_refused_without_operator_name(
    monkeypatch, respx_mock, mock_login, checked_bom
) -> None:
    monkeypatch.setenv("PFAIR_OPERATOR_NAME", "")
    config_module.get_settings.cache_clear()

    assert "Write actions are turned off" in await _preview_bom_reservation(BOM_ID)
    assert "Write actions are turned off" in await _reserve_bom("BOM-ABCDEF")


async def test_check_bom_result_can_be_previewed(respx_mock, mock_login, motor) -> None:
    import base64

    from pfair_mcp.tools.bom import _check_bom

    respx_mock.post(f"{API_BASE}/bom/check").mock(
        return_value=httpx.Response(
            200,
            json={
                "bom_id": BOM_ID,
                "filename": "vtol.csv",
                "items": [_item("Brushless Motor", 4, "available", motor)],
                "summary": {"available": 1, "low_stock": 0, "missing": 0},
            },
        )
    )
    _mock_stock(respx_mock, motor, 14)

    checked = await _check_bom("vtol.csv", base64.b64encode(b"x").decode())
    assert f'preview_bom_reservation(bom_id="{BOM_ID}")' in checked

    preview = await _preview_bom_reservation(BOM_ID)
    assert "take 4, 14 -> 10 left" in preview
