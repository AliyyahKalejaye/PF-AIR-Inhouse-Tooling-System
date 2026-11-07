from __future__ import annotations

import httpx
import pytest

from pfair_mcp.client import PFAirAPIError, PFAirConnectionError, get_client
from tests.conftest import API_BASE


async def test_logs_in_lazily_on_first_request(respx_mock, mock_login) -> None:
    route = respx_mock.get(f"{API_BASE}/components").mock(
        return_value=httpx.Response(200, json={"items": [], "total": 0, "limit": 50, "offset": 0,
                                                 "stats": {"total_skus": 0, "low_stock": 0,
                                                           "out_of_stock": 0, "categories": 0}})
    )
    client = get_client()
    data = await client.get("/components")
    assert data["total"] == 0
    assert mock_login.called
    assert route.called
    # the Authorization header on the real request carries the token login returned
    assert route.calls.last.request.headers["authorization"] == "Bearer fake-token"


async def test_relogs_in_once_on_401_then_succeeds(respx_mock, mock_login) -> None:
    route = respx_mock.get(f"{API_BASE}/components").mock(
        side_effect=[
            httpx.Response(401, json={"detail": "Could not validate credentials"}),
            httpx.Response(200, json={"items": [], "total": 0, "limit": 50, "offset": 0,
                                        "stats": {"total_skus": 0, "low_stock": 0,
                                                  "out_of_stock": 0, "categories": 0}}),
        ]
    )
    client = get_client()
    data = await client.get("/components")
    assert data["total"] == 0
    assert route.call_count == 2
    # login happened twice: once lazily, once after the 401
    assert mock_login.call_count == 2


async def test_second_401_after_relogin_raises(respx_mock, mock_login) -> None:
    respx_mock.get(f"{API_BASE}/components").mock(
        return_value=httpx.Response(401, json={"detail": "Could not validate credentials"})
    )
    client = get_client()
    with pytest.raises(PFAirAPIError) as exc_info:
        await client.get("/components")
    assert exc_info.value.status_code == 401


async def test_404_raises_with_backend_detail(respx_mock, mock_login) -> None:
    component_id = "11111111-1111-1111-1111-111111111111"
    respx_mock.get(f"{API_BASE}/components/{component_id}").mock(
        return_value=httpx.Response(404, json={"detail": "Component not found."})
    )
    client = get_client()
    with pytest.raises(PFAirAPIError) as exc_info:
        await client.get(f"/components/{component_id}")
    assert exc_info.value.detail == "Component not found."


async def test_connection_error_is_wrapped(respx_mock, mock_login) -> None:
    respx_mock.get(f"{API_BASE}/components").mock(side_effect=httpx.ConnectError("refused"))
    client = get_client()
    with pytest.raises(PFAirConnectionError):
        await client.get("/components")


async def test_timeout_message_is_not_blank(respx_mock) -> None:
    # httpx timeouts stringify to "", which used to leave a message ending
    # in a bare colon. Render cold starts hit this on the first call of the day.
    respx_mock.post(f"{API_BASE}/auth/login").mock(side_effect=httpx.ReadTimeout(""))

    with pytest.raises(PFAirConnectionError, match="timed out \\(ReadTimeout\\).*waking up"):
        await get_client().get("/components")


async def test_login_without_credentials_raises_clear_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PFAIR_SERVICE_PASSWORD", "")
    import pfair_mcp.client as client_module
    import pfair_mcp.config as config_module

    config_module.get_settings.cache_clear()
    client_module._client = None

    client = get_client()
    with pytest.raises(PFAirAPIError) as exc_info:
        await client.get("/components")
    assert "service account" in exc_info.value.detail.lower()
