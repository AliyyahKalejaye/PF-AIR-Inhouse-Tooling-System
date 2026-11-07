from __future__ import annotations

import re

import httpx

from pfair_mcp.tools.deletes import _confirm_delete, _preview_delete
from tests.conftest import API_BASE, make_component, new_id

PID = new_id()
ITEM_ID = new_id()
MEDIA_ID = new_id()
MOTOR = make_component(name="Brushless Motor 2212")
PROJECT = {
    "id": PID,
    "title": "VTOL Survey Drone",
    "status": "active",
    "mil_items": [{"id": ITEM_ID, "component": MOTOR, "quantity_required": 4}],
    "media": [
        {
            "id": MEDIA_ID,
            "media_type": "image",
            "file_url": "https://r2/x.png",
            "filename": "wing.png",
        }
    ],
}


def _code(text: str) -> str:
    match = re.search(r'confirmation_code="([^"]+)"', text)
    assert match, text
    return match.group(1)


def _mock_project(respx_mock):
    respx_mock.get(f"{API_BASE}/projects/{PID}").mock(
        return_value=httpx.Response(200, json=PROJECT)
    )


async def test_project_delete_preview_spells_out_consequences(respx_mock, mock_login) -> None:
    _mock_project(respx_mock)
    respx_mock.get(f"{API_BASE}/ecr").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": "e1", "title": "Swap motors", "project": {"id": PID, "title": "VTOL"}},
                {"id": "e2", "title": "Unrelated", "project": None},
            ],
        )
    )
    delete = respx_mock.delete(f"{API_BASE}/projects/{PID}").mock(return_value=httpx.Response(204))

    preview = await _preview_delete("project", PID, None, None)

    assert "parts list (1 line(s))" in preview
    assert "1 media item(s)" in preview
    assert "'Swap motors'" in preview and "Unrelated" not in preview
    assert "Everyone in PF-AIR is notified" in preview
    assert not delete.called

    result = await _confirm_delete(_code(preview))
    assert delete.call_count == 1
    assert result == "Deleted project 'VTOL Survey Drone'."


async def test_parts_list_line_delete_targets_the_line_not_the_part(respx_mock, mock_login) -> None:
    _mock_project(respx_mock)
    delete = respx_mock.delete(f"{API_BASE}/projects/{PID}/mil-items/{ITEM_ID}").mock(
        return_value=httpx.Response(204)
    )
    preview = await _preview_delete("parts_list_item", PID, "brushless motor 2212", None)
    assert "The part stays in inventory" in preview
    await _confirm_delete(_code(preview))
    assert delete.call_count == 1


async def test_media_delete_and_unknown_media(respx_mock, mock_login) -> None:
    _mock_project(respx_mock)
    delete = respx_mock.delete(f"{API_BASE}/projects/{PID}/media/{MEDIA_ID}").mock(
        return_value=httpx.Response(204)
    )
    missing = await _preview_delete("media", PID, None, new_id())
    assert "wing.png (image)" in missing
    assert "confirmation_code" not in missing

    preview = await _preview_delete("media", PID, None, MEDIA_ID)
    assert "deleted from storage" in preview
    code = _code(preview)
    await _confirm_delete(code)
    assert delete.call_count == 1
    assert "isn't valid" in await _confirm_delete(code)


async def test_bad_target(respx_mock, mock_login) -> None:
    assert "target must be one of" in await _preview_delete("component", PID, None, None)


async def test_other_kinds_of_code_cannot_delete(respx_mock, mock_login) -> None:
    from pfair_mcp import confirmations

    code = confirmations.issue("project_create", {"project": {}, "parts": []})
    assert "different kind of action" in await _confirm_delete(code)
