"""Shared fixtures for testing tool functions against a respx-mocked PF-AIR
API — no live backend needed, matching the existing backend/tests setup's
preference for mocking at the boundary rather than standing up real
infrastructure."""

from __future__ import annotations

import uuid
from typing import Any

import httpx
import pytest

import pfair_mcp.client as client_module
import pfair_mcp.config as config_module
import pfair_mcp.tools.bom as bom_module
from pfair_mcp import confirmations

API_BASE = "http://pfair.test/api/v1"


@pytest.fixture(autouse=True)
def pfair_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    """Points Settings at a fake API and resets the module-level client
    singleton before and after every test, so tests never share state (or
    an authenticated token) with each other."""
    monkeypatch.setenv("PFAIR_BASE_URL", "http://pfair.test")
    monkeypatch.setenv("PFAIR_API_PREFIX", "/api/v1")
    monkeypatch.setenv("PFAIR_SERVICE_EMAIL", "mcp-service@proforcedefence.com")
    monkeypatch.setenv("PFAIR_SERVICE_PASSWORD", "test-password")
    monkeypatch.setenv("PFAIR_OPERATOR_NAME", "Test Operator")
    monkeypatch.setenv("PFAIR_LOG_FILE", str(tmp_path / "tool_calls.log"))
    config_module.get_settings.cache_clear()
    client_module._client = None
    confirmations.reset()
    bom_module._checked_boms.clear()
    yield
    config_module.get_settings.cache_clear()
    client_module._client = None
    confirmations.reset()
    bom_module._checked_boms.clear()


@pytest.fixture
def mock_login(respx_mock: Any) -> Any:
    """Mocks a successful POST /auth/login — most tests need this since
    get_client() logs in lazily on first use."""
    return respx_mock.post(f"{API_BASE}/auth/login").mock(
        return_value=httpx.Response(
            200, json={"access_token": "fake-token", "token_type": "bearer"}
        )
    )


def new_id() -> str:
    return str(uuid.uuid4())


def make_category(**overrides: Any) -> dict[str, Any]:
    category = {"id": new_id(), "name": "Motors", "slug": "motors"}
    category.update(overrides)
    return category


def make_component(**overrides: Any) -> dict[str, Any]:
    component = {
        "id": new_id(),
        "name": "2306 2700kv Motor",
        "type": "Motor",
        "sku": "MOT-2306-2700",
        "brand": "T-Motor",
        "description": "Brushless motor for 5-inch builds.",
        "quantity": 12,
        "low_stock_threshold": 10,
        "image_url": None,
        "category": make_category(),
        "is_low_stock": False,
        "is_out_of_stock": False,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }
    component.update(overrides)
    return component


def make_user_ref(**overrides: Any) -> dict[str, Any]:
    ref = {"id": new_id(), "name": "Aliyyah Kalejaye", "email": "aliyyah@proforcedefence.com"}
    ref.update(overrides)
    return ref
