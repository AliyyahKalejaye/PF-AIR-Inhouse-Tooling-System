"""A minimal fixed-window rate limiter for the two endpoints where it
matters most — /auth/login and /auth/signup, the classic brute-force and
spam-signup targets.

Backed by the Redis this project already provisions (local docker-compose
+ Upstash in prod — see app/core/config.py's redis_url and the root
docker-compose.yml) rather than an in-memory counter: the backend can run
more than one worker process, and an in-memory count only ever sees the
requests that happened to land on that one process, so it under-counts
and the limit stops meaning anything.

Every check fails OPEN: if Redis is briefly unreachable, this logs a
warning and lets the request through rather than raising. For an internal
tooling app, "someone couldn't log in because the rate limiter's own
dependency hiccuped" is a worse failure mode than a few extra unthrottled
requests during a Redis blip.

Not exercised against a live Redis in this sandbox — no network access
here (see how this project's earlier phases have consistently relied on
the user's own docker-compose/CI as the real test of anything that needs
a running service). The redis-py async API used below (`redis.asyncio`,
`.incr`, `.expire`) has been stable since redis-py 4.2, well within the
`redis>=5.2` pin already in pyproject.toml.
"""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

import redis.asyncio as redis_asyncio
from fastapi import HTTPException, Request, status

from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

_redis: redis_asyncio.Redis | None = None


def _get_redis() -> redis_asyncio.Redis:
    global _redis
    if _redis is None:
        # Short timeouts, not the client's default of "wait forever" — in
        # an environment with no Redis at all (this project's CI has no
        # redis service; see .github/workflows/ci.yml), an unreachable
        # host should fail the try/except below in ~1s, not hang every
        # login/signup request until some outer timeout kills it.
        _redis = redis_asyncio.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _redis


def _client_ip(request: Request) -> str:
    # Render and Cloudflare both sit in front of this API as a reverse
    # proxy, so the real client IP arrives via X-Forwarded-For rather than
    # the raw connection — fall back to the raw peer address for local
    # dev, where nothing sets that header.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limiter(
    key_prefix: str, limit: int, window_seconds: int
) -> Callable[[Request], Coroutine[Any, Any, None]]:
    """Returns a FastAPI dependency enforcing `limit` requests per
    `window_seconds` per client IP, namespaced by `key_prefix` so
    different endpoints don't share a budget."""

    async def _check(request: Request) -> None:
        key = f"ratelimit:{key_prefix}:{_client_ip(request)}"
        try:
            client = _get_redis()
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, window_seconds)
        except HTTPException:
            raise
        except Exception:
            logger.warning("Rate limiter couldn't reach Redis — failing open for %s", key_prefix)
            return

        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please wait a few minutes and try again.",
            )

    return _check
