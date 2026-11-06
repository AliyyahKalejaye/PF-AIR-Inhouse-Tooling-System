from __future__ import annotations

import httpx

from pfair_mcp.tools.projects import _check_project_shortfall, _get_project, _list_projects
from tests.conftest import API_BASE, make_component


def _mil_item(component: dict, quantity_required: int) -> dict:
    return {
        "id": "m1111111-1111-1111-1111-111111111111",
        "component": component,
        "quantity_required": quantity_required,
        "created_at": "2026-01-01T00:00:00Z",
    }


def make_project(**overrides) -> dict:
    project = {
        "id": "p1111111-1111-1111-1111-111111111111",
        "title": "ZD550 Racing Quad",
        "problem_statement": "Need a lightweight 5-inch racer for the regional cup.",
        "abstract": None,
        "specifications": None,
        "requirement": None,
        "next_steps": None,
        "note": None,
        "status": "active",
        "media": [],
        "mil_items": [],
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "snippet": "Need a lightweight 5-inch racer for the regional cup.",
    }
    project.update(overrides)
    return project


async def test_list_projects_filters_by_title_client_side(respx_mock, mock_login) -> None:
    zd550 = make_project(title="ZD550 Racing Quad")
    other = make_project(id="p2222222-2222-2222-2222-222222222222", title="Fixed-Wing Scout")
    respx_mock.get(f"{API_BASE}/projects").mock(
        return_value=httpx.Response(200, json=[zd550, other])
    )
    result = await _list_projects(None, "zd550")
    assert "ZD550 Racing Quad" in result
    assert "Fixed-Wing Scout" not in result


async def test_list_projects_passes_status_filter_to_api(respx_mock, mock_login) -> None:
    route = respx_mock.get(f"{API_BASE}/projects").mock(return_value=httpx.Response(200, json=[]))
    await _list_projects("active", None)
    assert route.calls.last.request.url.params["project_status"] == "active"


async def test_get_project_renders_mil_with_stock(respx_mock, mock_login) -> None:
    arm = make_component(name="Frame Arm", quantity=2)
    project = make_project(mil_items=[_mil_item(arm, 4)])
    respx_mock.get(f"{API_BASE}/projects/{project['id']}").mock(
        return_value=httpx.Response(200, json=project)
    )
    result = await _get_project(project["id"])
    assert "ZD550 Racing Quad" in result
    assert "Frame Arm: need 4, 2 in stock" in result


async def test_check_project_shortfall_reports_short_and_covered_items(
    respx_mock, mock_login
) -> None:
    arm = make_component(name="Frame Arm", quantity=2)
    nut = make_component(name="Prop Nut", quantity=50)
    project = make_project(mil_items=[_mil_item(arm, 4), _mil_item(nut, 4)])
    respx_mock.get(f"{API_BASE}/projects/{project['id']}").mock(
        return_value=httpx.Response(200, json=project)
    )

    result = await _check_project_shortfall(project["id"])

    assert "SHORT (1):" in result
    assert "Frame Arm: need 4, have 2 — short by 2" in result
    assert "Covered (1):" in result
    assert "Prop Nut: need 4, have 50 — covered" in result


async def test_check_project_shortfall_nothing_short(respx_mock, mock_login) -> None:
    nut = make_component(name="Prop Nut", quantity=50)
    project = make_project(mil_items=[_mil_item(nut, 4)])
    respx_mock.get(f"{API_BASE}/projects/{project['id']}").mock(
        return_value=httpx.Response(200, json=project)
    )
    result = await _check_project_shortfall(project["id"])
    assert "Nothing is short" in result


async def test_check_project_shortfall_no_mil_items(respx_mock, mock_login) -> None:
    project = make_project(mil_items=[])
    respx_mock.get(f"{API_BASE}/projects/{project['id']}").mock(
        return_value=httpx.Response(200, json=project)
    )
    result = await _check_project_shortfall(project["id"])
    assert "no MIL items defined" in result
