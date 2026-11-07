from __future__ import annotations

import json
import re

import httpx

from pfair_mcp.tools.project_write import (
    PartLine,
    _add_project_link,
    _create_project,
    _preview_new_project,
    _set_parts_list_quantity,
    _update_project,
)
from tests.conftest import API_BASE, make_component, new_id

MOTOR = make_component(name="Brushless Motor 2212", quantity=14)
FC = make_component(name="Flight Controller - Pixhawk 6C", quantity=5)
SCREW_10 = make_component(name="M3x10 Screw", quantity=200)
SCREW_12 = make_component(name="M3x12 Screw", quantity=150)
INVENTORY = [MOTOR, FC, SCREW_10, SCREW_12]

EMPTY_FIELDS = dict.fromkeys(
    ("problem_statement", "abstract", "specifications", "requirement", "next_steps", "note")
)


def _code(text: str) -> str:
    match = re.search(r'confirmation_code="([^"]+)"', text)
    assert match, text
    return match.group(1)


def _mock_inventory(respx_mock, existing_projects=()):
    """Component search behaves like the backend's ILIKE across fields;
    GET /components/{id} returns that component."""

    def search(request: httpx.Request) -> httpx.Response:
        q = (request.url.params.get("q") or "").lower()
        hits = [c for c in INVENTORY if q in c["name"].lower()]
        return httpx.Response(
            200, json={"items": hits, "total": len(hits), "limit": 200, "offset": 0, "stats": {}}
        )

    respx_mock.get(f"{API_BASE}/components").mock(side_effect=search)
    for c in INVENTORY:
        respx_mock.get(f"{API_BASE}/components/{c['id']}").mock(
            return_value=httpx.Response(200, json=c)
        )
    respx_mock.get(f"{API_BASE}/projects").mock(
        return_value=httpx.Response(200, json=list(existing_projects))
    )


async def test_preview_then_create_project_with_parts_list(respx_mock, mock_login) -> None:
    _mock_inventory(respx_mock)
    pid = new_id()
    create = respx_mock.post(f"{API_BASE}/projects").mock(
        return_value=httpx.Response(
            201, json={"id": pid, "title": "Cargo Drone", "status": "active"}
        )
    )
    mil = respx_mock.post(f"{API_BASE}/projects/{pid}/mil-items").mock(
        return_value=httpx.Response(201, json={})
    )

    fields = {**EMPTY_FIELDS, "problem_statement": "Need to carry 5kg.", "note": "From the PDR."}
    preview = await _preview_new_project(
        "Cargo Drone",
        fields,
        "active",
        [
            PartLine(part="brushless motor 2212", quantity=4),
            PartLine(part=FC["id"], quantity=1),
            PartLine(part="Brushless-Motor-2212", quantity=2),  # same part again: merged
        ],
    )
    assert "Brushless Motor 2212: need 6 (14 in stock)" in preview
    assert "Flight Controller - Pixhawk 6C: need 1" in preview
    assert "notifies everyone" in preview
    assert not create.called

    result = await _create_project(_code(preview))

    sent = json.loads(create.calls[0].request.content)
    assert sent["title"] == "Cargo Drone"
    assert sent["problem_statement"] == "Need to carry 5kg."
    assert sent["note"] == "From the PDR.\n\nCreated via Claude on behalf of Test Operator."
    assert sent["abstract"] is None
    lines = [json.loads(c.request.content) for c in mil.calls]
    assert lines == [
        {"component_id": MOTOR["id"], "quantity_required": 6},
        {"component_id": FC["id"], "quantity_required": 1},
    ]
    assert "Parts list (2 added)" in result


async def test_partial_parts_list_failure_is_reported(respx_mock, mock_login) -> None:
    _mock_inventory(respx_mock)
    pid = new_id()
    respx_mock.post(f"{API_BASE}/projects").mock(
        return_value=httpx.Response(201, json={"id": pid, "title": "X", "status": "active"})
    )
    respx_mock.post(f"{API_BASE}/projects/{pid}/mil-items").mock(
        side_effect=[
            httpx.Response(201, json={}),
            httpx.Response(404, json={"detail": "Component not found."}),
        ]
    )
    preview = await _preview_new_project(
        "X", EMPTY_FIELDS, "active", [PartLine(part=MOTOR["id"]), PartLine(part=FC["id"])]
    )
    result = await _create_project(_code(preview))
    assert "Parts list (1 added)" in result
    assert "Flight Controller - Pixhawk 6C: Component not found." in result
    assert "the project exists" in result


async def test_ambiguous_part_blocks_preview(respx_mock, mock_login) -> None:
    _mock_inventory(respx_mock)
    result = await _preview_new_project(
        "X", EMPTY_FIELDS, "active", [PartLine(part="M3", quantity=10)]
    )
    assert "don't match exactly one inventory part" in result
    assert "M3x10 Screw" in result and "M3x12 Screw" in result
    assert "confirmation_code" not in result


async def test_duplicate_title_is_warned(respx_mock, mock_login) -> None:
    _mock_inventory(
        respx_mock, existing_projects=[{"id": "p1", "title": "Cargo drone", "status": "paused"}]
    )
    result = await _preview_new_project("Cargo Drone", EMPTY_FIELDS, "active", None)
    assert "already exists" in result
    assert "confirmation_code" in result


async def test_bad_status_rejected(respx_mock, mock_login) -> None:
    result = await _preview_new_project("X", EMPTY_FIELDS, "finished", None)
    assert "status must be one of" in result


async def test_update_sends_only_given_fields_and_clears_with_empty(respx_mock, mock_login) -> None:
    pid = new_id()
    before = {
        "id": pid,
        "title": "VTOL",
        "status": "active",
        "note": "old note",
        "next_steps": None,
    }
    after = {**before, "status": "paused", "note": None, "next_steps": "Wind tunnel"}
    respx_mock.get(f"{API_BASE}/projects/{pid}").mock(return_value=httpx.Response(200, json=before))
    patch = respx_mock.patch(f"{API_BASE}/projects/{pid}").mock(
        return_value=httpx.Response(200, json=after)
    )

    result = await _update_project(
        pid, {"title": None, "status": "Paused", "note": "", "next_steps": "Wind tunnel"}
    )

    assert json.loads(patch.calls[0].request.content) == {
        "status": "paused",
        "note": None,
        "next_steps": "Wind tunnel",
    }
    assert "Status: active -> paused" in result
    assert "Note: old note -> (empty)" in result
    assert "notified of the status change" in result


async def test_title_cannot_be_cleared(respx_mock, mock_login) -> None:
    patch = respx_mock.patch(url__regex=rf"{API_BASE}/projects/.*")
    assert "can't be cleared" in await _update_project(new_id(), {"title": "  "})
    assert not patch.called


async def test_set_parts_list_quantity_patches_the_right_line(respx_mock, mock_login) -> None:
    pid, item_id = new_id(), new_id()
    project = {
        "id": pid,
        "title": "VTOL",
        "mil_items": [{"id": item_id, "component": MOTOR, "quantity_required": 4}],
        "media": [],
    }
    respx_mock.get(f"{API_BASE}/projects/{pid}").mock(
        return_value=httpx.Response(200, json=project)
    )
    patch = respx_mock.patch(f"{API_BASE}/projects/{pid}/mil-items/{item_id}").mock(
        return_value=httpx.Response(200, json={"component": MOTOR, "quantity_required": 8})
    )
    result = await _set_parts_list_quantity(pid, "Brushless Motor 2212", 8)
    assert json.loads(patch.calls[0].request.content) == {"quantity_required": 8}
    assert "4 -> 8" in result

    missing = await _set_parts_list_quantity(pid, "Pixhawk", 1)
    assert "isn't on VTOL's parts list" in missing


async def test_project_link_must_be_http(respx_mock, mock_login) -> None:
    pid = new_id()
    post = respx_mock.post(f"{API_BASE}/projects/{pid}/media/link").mock(
        return_value=httpx.Response(201, json={"id": "m1", "filename": "Firmware"})
    )
    assert "full http(s) URL" in await _add_project_link(pid, "github.com/x", None)
    assert not post.called
    result = await _add_project_link(pid, "https://github.com/proforce/fw", "Firmware")
    assert json.loads(post.calls[0].request.content) == {
        "media_type": "code",
        "file_url": "https://github.com/proforce/fw",
        "filename": "Firmware",
    }
    assert "Attached Firmware" in result
