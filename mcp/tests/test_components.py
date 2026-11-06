from __future__ import annotations

import httpx

from pfair_mcp.tools.components import _get_component, _search_components
from tests.conftest import API_BASE, make_category, make_component


def _list_response(items: list[dict], total: int | None = None) -> dict:
    return {
        "items": items,
        "total": total if total is not None else len(items),
        "limit": 50,
        "offset": 0,
        "stats": {"total_skus": 42, "low_stock": 3, "out_of_stock": 1, "categories": 5},
    }


async def test_search_components_plain_query(respx_mock, mock_login) -> None:
    component = make_component(name="2306 2700kv Motor", quantity=12)
    respx_mock.get(f"{API_BASE}/components").mock(
        return_value=httpx.Response(200, json=_list_response([component]))
    )
    result = await _search_components("2306", None, "all", 20)
    assert "2306 2700kv Motor" in result
    assert "12 on hand" in result
    assert "in stock" in result


async def test_search_components_no_results(respx_mock, mock_login) -> None:
    respx_mock.get(f"{API_BASE}/components").mock(
        return_value=httpx.Response(200, json=_list_response([]))
    )
    result = await _search_components("nonexistent-part", None, "all", 20)
    assert result == "No components matched that search."


async def test_search_components_resolves_category_name(respx_mock, mock_login) -> None:
    motors = make_category(name="Motors", slug="motors")
    respx_mock.get(f"{API_BASE}/categories").mock(
        return_value=httpx.Response(200, json=[motors, make_category(name="Frames", slug="frames")])
    )
    component = make_component(category=motors)
    route = respx_mock.get(f"{API_BASE}/components").mock(
        return_value=httpx.Response(200, json=_list_response([component]))
    )
    result = await _search_components(None, "motors", "all", 20)
    assert route.calls.last.request.url.params["category_id"] == motors["id"]
    assert "2306 2700kv Motor" in result


async def test_search_components_unknown_category_lists_known_ones(respx_mock, mock_login) -> None:
    respx_mock.get(f"{API_BASE}/categories").mock(
        return_value=httpx.Response(200, json=[make_category(name="Motors")])
    )
    result = await _search_components(None, "widgets", "all", 20)
    assert "No category matching 'widgets'" in result
    assert "Motors" in result


async def test_search_components_flags_out_of_stock(respx_mock, mock_login) -> None:
    component = make_component(quantity=0, is_out_of_stock=True, is_low_stock=False)
    respx_mock.get(f"{API_BASE}/components").mock(
        return_value=httpx.Response(200, json=_list_response([component]))
    )
    result = await _search_components(None, None, "out", 20)
    assert "OUT OF STOCK" in result


async def test_get_component_not_found_message(respx_mock, mock_login) -> None:
    component_id = "11111111-1111-1111-1111-111111111111"
    respx_mock.get(f"{API_BASE}/components/{component_id}").mock(
        return_value=httpx.Response(404, json={"detail": "Component not found."})
    )
    from pfair_mcp.client import PFAirAPIError

    try:
        await _get_component(component_id)
    except PFAirAPIError as exc:
        assert exc.detail == "Component not found."
    else:
        raise AssertionError("expected PFAirAPIError")


async def test_get_component_full_detail(respx_mock, mock_login) -> None:
    component = make_component(description="Brushless motor for 5-inch builds.")
    respx_mock.get(f"{API_BASE}/components/{component['id']}").mock(
        return_value=httpx.Response(200, json=component)
    )
    result = await _get_component(component["id"])
    assert component["name"] in result
    assert "SKU: MOT-2306-2700" in result
    assert "Brushless motor for 5-inch builds." in result


async def test_run_logged_wraps_not_found_into_readable_string(
    respx_mock, mock_login, tmp_path
) -> None:
    """End-to-end through the public tool (search_components / get_component
    go through run_logged), confirming a 404 becomes a string result, not a
    raised exception, and gets written to the log file."""
    from mcp.server.mcpserver import MCPServer

    from pfair_mcp.config import get_settings
    from pfair_mcp.tools.components import register

    component_id = "22222222-2222-2222-2222-222222222222"
    respx_mock.get(f"{API_BASE}/components/{component_id}").mock(
        return_value=httpx.Response(404, json={"detail": "Component not found."})
    )

    mcp = MCPServer("test")
    register(mcp)
    result = await mcp.call_tool("get_component", {"component_id": component_id})
    text = result.content[0].text
    assert "Component not found." in text

    log_file = get_settings().log_file
    contents = open(log_file).read()
    assert "get_component" in contents
    assert '"success": false' in contents
