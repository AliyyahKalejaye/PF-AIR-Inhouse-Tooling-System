"""Cross-cutting HTTP middleware: request-id assignment + access logging,
plus a baseline set of security response headers.

Written as plain Starlette middleware rather than reaching for a
third-party package (e.g. a security-headers library) — this app's whole
request lifecycle stays auditable in one small file we can actually read,
rather than depending on the exact behavior/version of an external
package this sandbox has no way to install and test against (see
app/core/rate_limit.py's module docstring for the same call made about
rate limiting).
"""

import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings
from app.core.logging import logger, request_id_ctx

settings = get_settings()

Handler = Callable[[Request], Awaitable[Response]]


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a short request id, echoes it back as X-Request-Id (handy
    when a user reports "it broke" and can paste what their browser's
    network tab showed), and logs one access line per request with
    method/path/status/timing.

    By the time a response reaches this middleware, FastAPI's own
    exception handlers (including the catch-all registered in
    app/main.py) have already turned any error into a normal Response —
    call_next() below is not expected to raise.
    """

    async def dispatch(self, request: Request, call_next: Handler) -> Response:
        req_id = uuid.uuid4().hex[:12]
        token = request_id_ctx.set(req_id)
        start = time.monotonic()
        try:
            response = await call_next(request)
            duration_ms = (time.monotonic() - start) * 1000
            logger.info(
                "%s %s -> %d (%.1fms)",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )
            response.headers["X-Request-Id"] = req_id
            return response
        finally:
            request_id_ctx.reset(token)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """A baseline set of security headers on every response. No
    Content-Security-Policy here on purpose — this API only ever serves
    JSON (plus /docs' Swagger UI, and only outside production — see
    app/main.py), never the HTML/JS a CSP is meant to constrain. The
    headers below instead stop *this API's responses* from being misused
    if something ever embeds or sniffs them (clickjacking via an iframe,
    MIME-sniffing a JSON body as something executable, leaking full
    referrer URLs cross-origin)."""

    async def dispatch(self, request: Request, call_next: Handler) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if settings.is_production:
            # HSTS only makes sense over HTTPS, which is all Render/
            # Cloudflare ever terminate in production — sending it in
            # local http:// dev would just be misleading.
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response
