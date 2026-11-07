"""Check whether this machine's Python can reach the PF-AIR backend, using
the same settings (mcp/.env) the MCP server uses. Reports each step's HTTP
status, timing, and the exact error type if one fails.

    uv run python diagnose_connection.py
"""

import asyncio
import time

import httpx

from pfair_mcp.config import get_settings


async def _step(label: str, call) -> httpx.Response | None:
    started = time.monotonic()
    try:
        response = await call()
    except Exception as exc:  # report anything, this is a diagnostic
        print(f"{label}: FAILED after {time.monotonic() - started:.1f}s")
        print(f"   {type(exc).__module__}.{type(exc).__name__}: {exc!r}")
        return None
    print(f"{label}: HTTP {response.status_code} in {time.monotonic() - started:.1f}s")
    if response.is_error:
        print("   body:", response.text[:300])
        return None
    return response


async def main() -> None:
    settings = get_settings()
    print("Base URL:", settings.api_base)
    async with httpx.AsyncClient(base_url=settings.api_base, timeout=120) as http:
        if await _step("GET /health", lambda: http.get("/health")) is None:
            return
        login = await _step(
            "POST /auth/login",
            lambda: http.post(
                "/auth/login",
                data={"username": settings.service_email, "password": settings.service_password},
            ),
        )
        if login is None:
            return
        token = login.json()["access_token"]
        projects = await _step(
            "GET /projects",
            lambda: http.get("/projects", headers={"Authorization": f"Bearer {token}"}),
        )
        if projects is None:
            return
    print("All good - Python on this machine can reach PF-AIR.")


if __name__ == "__main__":
    asyncio.run(main())
