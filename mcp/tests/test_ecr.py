from __future__ import annotations

import httpx

from pfair_mcp.tools.ecr import _get_ecr, _list_ecrs
from tests.conftest import API_BASE, make_user_ref


def make_ecr(**overrides) -> dict:
    ecr = {
        "id": "e1111111-1111-1111-1111-111111111111",
        "title": "Swap FC for one with built-in baro",
        "reason": "Current FC lacks a barometer, altitude hold is unreliable.",
        "description": None,
        "status": "submitted",
        "priority": "high",
        "project": {"id": "p1111111-1111-1111-1111-111111111111", "title": "ZD550 Racing Quad"},
        "component": None,
        "component_name": "SpeedyBee F405 V4",
        "requester": make_user_ref(name="Aliyyah Kalejaye", email="aliyyah@proforcedefence.com"),
        "assigned_approver": make_user_ref(
            name="Chief Engineer", email="chief@proforcedefence.com"
        ),
        "reviewer": None,
        "review_notes": None,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }
    ecr.update(overrides)
    return ecr


async def test_list_ecrs_formats_requester_and_approver(respx_mock, mock_login) -> None:
    respx_mock.get(f"{API_BASE}/ecr").mock(return_value=httpx.Response(200, json=[make_ecr()]))
    result = await _list_ecrs(None)
    assert "Swap FC for one with built-in baro" in result
    assert "requested by Aliyyah Kalejaye <aliyyah@proforcedefence.com>" in result
    assert "approver: Chief Engineer <chief@proforcedefence.com>" in result


async def test_list_ecrs_passes_status_filter(respx_mock, mock_login) -> None:
    route = respx_mock.get(f"{API_BASE}/ecr").mock(return_value=httpx.Response(200, json=[]))
    await _list_ecrs("approved")
    assert route.calls.last.request.url.params["ecr_status"] == "approved"


async def test_list_ecrs_no_results(respx_mock, mock_login) -> None:
    respx_mock.get(f"{API_BASE}/ecr").mock(return_value=httpx.Response(200, json=[]))
    result = await _list_ecrs(None)
    assert result == "No change requests matched."


async def test_get_ecr_includes_comments(respx_mock, mock_login) -> None:
    ecr = make_ecr()
    respx_mock.get(f"{API_BASE}/ecr/{ecr['id']}").mock(return_value=httpx.Response(200, json=ecr))
    comments = [
        {
            "id": "c1111111-1111-1111-1111-111111111111",
            "author": make_user_ref(name="Chief Engineer", email="chief@proforcedefence.com"),
            "body": "Checked stock — SpeedyBee F405 V4 is available, approving once CAD updates.",
            "created_at": "2026-01-02T00:00:00Z",
        }
    ]
    respx_mock.get(f"{API_BASE}/ecr/{ecr['id']}/comments").mock(
        return_value=httpx.Response(200, json=comments)
    )
    result = await _get_ecr(ecr["id"])
    assert "Comments (1):" in result
    assert "Checked stock" in result
    assert "Chief Engineer <chief@proforcedefence.com>" in result


async def test_get_ecr_no_comments(respx_mock, mock_login) -> None:
    ecr = make_ecr()
    respx_mock.get(f"{API_BASE}/ecr/{ecr['id']}").mock(return_value=httpx.Response(200, json=ecr))
    respx_mock.get(f"{API_BASE}/ecr/{ecr['id']}/comments").mock(
        return_value=httpx.Response(200, json=[])
    )
    result = await _get_ecr(ecr["id"])
    assert "Comments: none yet." in result


async def test_get_ecr_shows_decision_for_reviewed_request(respx_mock, mock_login) -> None:
    ecr = make_ecr(
        status="approved",
        reviewer=make_user_ref(name="Chief Engineer", email="chief@proforcedefence.com"),
        review_notes="Looks good, proceed.",
    )
    respx_mock.get(f"{API_BASE}/ecr/{ecr['id']}").mock(return_value=httpx.Response(200, json=ecr))
    respx_mock.get(f"{API_BASE}/ecr/{ecr['id']}/comments").mock(
        return_value=httpx.Response(200, json=[])
    )
    result = await _get_ecr(ecr["id"])
    assert "Decided by: Chief Engineer <chief@proforcedefence.com>" in result
    assert "Review notes: Looks good, proceed." in result
