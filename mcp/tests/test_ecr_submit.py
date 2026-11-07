from __future__ import annotations

import json
import re

import httpx

from pfair_mcp.server import mcp
from pfair_mcp.tools.ecr_submit import _preview_ecr, _submit_ecr
from tests.conftest import API_BASE, make_component, make_user_ref, new_id

APPROVER = make_user_ref(name="Aliyyah Kalejaye", email="aliyyah@proforcedefence.com")
SERVICE = make_user_ref(name="MCP Service Account", email="mcp-service@proforcedefence.com")
OTHER_ALI = make_user_ref(name="Ali Musa", email="ali.musa@proforcedefence.com")


def _code(text: str) -> str:
    match = re.search(r'confirmation_code="([^"]+)"', text)
    assert match, text
    return match.group(1)


def _preview_args(**overrides):
    args = {
        "title": "Swap to 2814 motors",
        "reason": "2212s overheat on the 45-minute mission.",
        "description": "Replace all four motors.",
        "priority": "high",
        "project_id": None,
        "component_id": None,
        "component_name": None,
        "approver": None,
    }
    args.update(overrides)
    return args


def _mock_approvers(respx_mock):
    respx_mock.get(f"{API_BASE}/ecr/approvers").mock(
        return_value=httpx.Response(200, json=[APPROVER, SERVICE, OTHER_ALI])
    )


async def test_preview_then_submit_sends_exactly_the_previewed_payload(
    respx_mock, mock_login
) -> None:
    project_id = new_id()
    component = make_component(name="Brushless Motor 2212")
    respx_mock.get(f"{API_BASE}/projects/{project_id}").mock(
        return_value=httpx.Response(200, json={"id": project_id, "title": "VTOL Survey Drone"})
    )
    respx_mock.get(f"{API_BASE}/components/{component['id']}").mock(
        return_value=httpx.Response(200, json=component)
    )
    _mock_approvers(respx_mock)
    create = respx_mock.post(f"{API_BASE}/ecr").mock(
        return_value=httpx.Response(
            201,
            json={
                "id": "e1",
                "title": "Swap to 2814 motors",
                "status": "submitted",
                "priority": "high",
                "assigned_approver": APPROVER,
            },
        )
    )

    preview = await _preview_ecr(
        **_preview_args(
            project_id=project_id,
            component_id=component["id"],
            component_name="ignored free text",
            approver="aliyyah@proforcedefence.com",
        )
    )
    assert "Project: VTOL Survey Drone" in preview
    assert "Approver: Aliyyah Kalejaye" in preview
    assert "component_name is ignored" in preview
    assert "Submitted via Claude on behalf of Test Operator." in preview
    assert not create.called

    result = await _submit_ecr(_code(preview))

    assert create.call_count == 1
    sent = json.loads(create.calls[0].request.content)
    assert sent == {
        "title": "Swap to 2814 motors",
        "reason": "2212s overheat on the 45-minute mission.",
        "description": (
            "Replace all four motors.\n\nSubmitted via Claude on behalf of Test Operator."
        ),
        "priority": "high",
        "project_id": project_id,
        "component_id": component["id"],
        "component_name": None,
        "assigned_approver_id": APPROVER["id"],
    }
    assert "id=e1" in result
    assert "awaiting review by Aliyyah Kalejaye" in result


async def test_code_is_single_use(respx_mock, mock_login) -> None:
    create = respx_mock.post(f"{API_BASE}/ecr").mock(
        return_value=httpx.Response(
            201,
            json={
                "id": "e1",
                "title": "t",
                "status": "submitted",
                "priority": "high",
                "assigned_approver": None,
            },
        )
    )
    code = _code(await _preview_ecr(**_preview_args()))
    await _submit_ecr(code)
    assert "isn't valid" in await _submit_ecr(code)
    assert create.call_count == 1


async def test_untagged_preview_warns_nobody_can_approve(respx_mock, mock_login) -> None:
    preview = await _preview_ecr(**_preview_args())
    assert "Everyone is notified" in preview
    assert "Nobody can approve or reject it" in preview


async def test_service_account_cannot_be_approver(respx_mock, mock_login) -> None:
    _mock_approvers(respx_mock)
    result = await _preview_ecr(**_preview_args(approver="mcp-service@proforcedefence.com"))
    assert "can't be tagged as approver" in result
    assert "confirmation_code" not in result


async def test_ambiguous_approver_lists_options(respx_mock, mock_login) -> None:
    _mock_approvers(respx_mock)
    result = await _preview_ecr(**_preview_args(approver="ali"))
    assert "matches more than one person" in result
    assert "aliyyah@proforcedefence.com" in result
    assert "ali.musa@proforcedefence.com" in result


async def test_unknown_project_is_reported(respx_mock, mock_login) -> None:
    project_id = new_id()
    respx_mock.get(f"{API_BASE}/projects/{project_id}").mock(
        return_value=httpx.Response(404, json={"detail": "Project not found."})
    )
    result = await _preview_ecr(**_preview_args(project_id=project_id))
    assert "No project with id" in result


async def test_bad_priority_and_empty_title_rejected(respx_mock, mock_login) -> None:
    result = await _preview_ecr(**_preview_args(title="  ", priority="critical"))
    assert "title is empty" in result
    assert "priority must be one of" in result


async def test_bom_code_cannot_submit_an_ecr(respx_mock, mock_login) -> None:
    from pfair_mcp import confirmations

    code = confirmations.issue("bom_reserve", {"bom_id": "x", "plan": []})
    assert "different kind of action" in await _submit_ecr(code)


async def test_tool_surface_and_annotations() -> None:
    tools = {t.name: t for t in await mcp.list_tools()}

    # The complete tool surface. Anything new has to be added here on
    # purpose — in particular, ECR decisions (approve/reject/implement),
    # ECR edits/deletes and inventory-part deletes stay human-only.
    assert set(tools) == {
        "search_components",
        "get_component",
        "update_component",
        "preview_inventory_import",
        "import_inventory",
        "check_bom",
        "preview_bom_reservation",
        "reserve_bom",
        "list_projects",
        "get_project",
        "check_project_shortfall",
        "preview_new_project",
        "create_project",
        "update_project",
        "add_parts_list_item",
        "set_parts_list_quantity",
        "add_project_link",
        "preview_delete",
        "confirm_delete",
        "list_ecrs",
        "get_ecr",
        "preview_ecr",
        "submit_ecr",
    }
    for name in tools:
        assert not re.search(r"approve|reject|implement", name), name

    assert tools["reserve_bom"].annotations.destructive_hint is True
    assert tools["reserve_bom"].annotations.read_only_hint is False
    assert tools["submit_ecr"].annotations.read_only_hint is False
    assert tools["confirm_delete"].annotations.destructive_hint is True
    for read_only in (
        "preview_bom_reservation",
        "preview_ecr",
        "preview_new_project",
        "preview_inventory_import",
        "preview_delete",
        "list_projects",
        "get_ecr",
    ):
        assert tools[read_only].annotations.read_only_hint is True
