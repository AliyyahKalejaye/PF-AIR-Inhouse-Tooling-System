"""Thin async HTTP client for the PF-AIR backend's REST API.

Authenticates as a dedicated service account via POST {api_prefix}/auth/login
(see backend/app/api/routes/auth.py — it's an OAuth2PasswordRequestForm
endpoint, so the login call must be form-encoded, not JSON, with the email
in the "username" field). There is no refresh-token endpoint in PF-AIR
today, so "refreshing" here just means: on a 401, log in again and retry
the request once. The access token also carries its own expiry
(settings.jwt_expires_minutes on the backend, 7 days by default) baked
into the JWT, but this client doesn't bother decoding it — reacting to an
actual 401 is simpler and can't drift out of sync with whatever the
backend's real expiry is configured to.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from pfair_mcp.config import Settings, get_settings

logger = logging.getLogger("pfair_mcp.client")


class PFAirAPIError(Exception):
    """Raised for any non-2xx response from the PF-AIR API, after retrying
    an expired-token 401 once. Carries enough detail for a tool function to
    turn this into a clear message for the model/user, without leaking a
    raw traceback."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"PF-AIR API error ({status_code}): {detail}")


class PFAirConnectionError(Exception):
    """Raised when the PF-AIR API can't be reached at all (connection
    refused, DNS failure, timeout) — distinct from PFAirAPIError so callers
    can give a different message ("is the backend running?" vs. "that
    record doesn't exist")."""


def _extract_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:500] or response.reason_phrase
    if isinstance(body, dict) and "detail" in body:
        detail = body["detail"]
        return detail if isinstance(detail, str) else str(detail)
    return str(body)[:500]


def _describe_request_error(exc: httpx.RequestError, api_base: str) -> str:
    """Turn an httpx transport error into a readable message. Some httpx
    errors (timeouts especially) stringify to an empty string, which left
    the old message ending in a bare colon with no clue what went wrong —
    so always include the error type, and spell out the timeout case."""
    if isinstance(exc, httpx.TimeoutException):
        return (
            f"Couldn't reach PF-AIR at {api_base}: timed out ({type(exc).__name__}). "
            "If the backend is on Render's free tier it may still be waking up "
            "from idle — try again in a minute."
        )
    detail = str(exc) or "no further detail"
    return f"Couldn't reach PF-AIR at {api_base}: {type(exc).__name__}: {detail}"


class PFAirClient:
    """One instance is created per server process and reused across tool
    calls, so the access token (and the underlying httpx connection pool)
    is shared rather than re-authenticating on every call."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._http = httpx.AsyncClient(
            base_url=self._settings.api_base,
            timeout=self._settings.request_timeout_seconds,
        )
        self._token: str | None = None

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _login(self) -> None:
        if not self._settings.service_email or not self._settings.service_password:
            raise PFAirAPIError(
                status_code=401,
                detail=(
                    "No PF-AIR service account configured — set PFAIR_SERVICE_EMAIL and "
                    "PFAIR_SERVICE_PASSWORD in mcp/.env."
                ),
            )
        try:
            response = await self._http.post(
                "/auth/login",
                data={
                    "username": self._settings.service_email,
                    "password": self._settings.service_password,
                },
            )
        except httpx.RequestError as exc:
            raise PFAirConnectionError(
                _describe_request_error(exc, self._settings.api_base)
            ) from exc

        if response.status_code != httpx.codes.OK:
            raise PFAirAPIError(response.status_code, _extract_detail(response))

        self._token = response.json()["access_token"]

    async def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
        _retrying: bool = False,
    ) -> httpx.Response:
        if self._token is None:
            await self._login()

        try:
            response = await self._http.request(
                method,
                path,
                params=params,
                json=json,
                files=files,
                headers={"Authorization": f"Bearer {self._token}"},
            )
        except httpx.RequestError as exc:
            raise PFAirConnectionError(
                _describe_request_error(exc, self._settings.api_base)
            ) from exc

        if response.status_code == httpx.codes.UNAUTHORIZED and not _retrying:
            # Token expired (or was never valid) — log in again and retry
            # exactly once. If this second attempt also 401s, it's a real
            # auth problem (bad credentials), not an expiry — let it raise.
            logger.info("Got 401 from PF-AIR API, re-authenticating and retrying once")
            self._token = None
            await self._login()
            return await self.request(
                method, path, params=params, json=json, files=files, _retrying=True
            )

        if response.is_error:
            # Covers 404 (not found), 403 (forbidden), 422 (validation), 5xx, etc.
            # — tool functions turn this into a message appropriate to what
            # they were trying to do (e.g. "no project with that id").
            raise PFAirAPIError(response.status_code, _extract_detail(response))

        return response

    async def get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        response = await self.request("GET", path, params=params)
        return response.json()

    async def post(
        self,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
    ) -> Any:
        response = await self.request("POST", path, json=json, files=files)
        return response.json()

    async def patch(self, path: str, *, json: dict[str, Any]) -> Any:
        response = await self.request("PATCH", path, json=json)
        return response.json()

    async def delete(self, path: str) -> None:
        # PF-AIR's DELETE routes all return 204 with no body.
        await self.request("DELETE", path)


_client: PFAirClient | None = None


def get_client() -> PFAirClient:
    """Module-level singleton — every tool call goes through the same
    client instance so the login token is shared, not re-fetched per call."""
    global _client
    if _client is None:
        _client = PFAirClient()
    return _client
