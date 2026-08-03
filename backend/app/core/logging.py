"""Structured-ish logging configuration.

Render (and most PaaS log collectors) ingest stdout as plain text lines, so
this uses a single-line, greppable format rather than emitting JSON — a
human tailing `render logs` can read it directly, and every line carries a
short request id (set by app.core.middleware.RequestContextMiddleware) via
a contextvar, so log lines from the same request can be correlated without
threading the id through every function signature by hand.
"""

import logging
import sys
from contextvars import ContextVar

# Default "-" so any log line emitted outside a request (startup, a
# background task) still matches the format string instead of KeyError'ing.
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()  # type: ignore[attr-defined]
        return True


def configure_logging(level: str = "INFO") -> None:
    """Call once at app startup (see app/main.py). Safe to call more than
    once — clears any handlers it previously installed first — mainly so
    the test suite importing app.main repeatedly doesn't stack handlers."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)-8s [req:%(request_id)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    handler.addFilter(_RequestIdFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # uvicorn's own access log duplicates what RequestContextMiddleware
    # already logs (method/path/status), minus the request id and timing —
    # quiet it to WARNING so each request produces one line, not two.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


logger = logging.getLogger("app")
