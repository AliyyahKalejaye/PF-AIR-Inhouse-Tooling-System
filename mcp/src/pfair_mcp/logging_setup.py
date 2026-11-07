"""Local audit log for every MCP tool call, plus the shared error-handling
wrapper every tool function runs through.

Writes one JSON line per call to PFAIR_LOG_FILE (name, inputs, success/
failure, duration) — exactly the fields Phase 3's audit-log table is meant
to capture, kept here as a flat file for now so this phase doesn't need its
own database.

`run_logged` is the only thing tool modules import from here: it wraps a
tool's body, turns PFAirAPIError/PFAirConnectionError into a clear string
(rather than letting a raw exception/traceback reach the MCP client), and
logs the outcome either way. The backend's own HTTPException details
(e.g. "Component not found.", "Project not found.") are already written to
be read by a human, so they're surfaced verbatim rather than re-worded.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pfair_mcp.client import PFAirAPIError, PFAirConnectionError
from pfair_mcp.config import get_settings

_logger = logging.getLogger("pfair_mcp.tool_calls")
_configured = False


def _configure() -> None:
    global _configured
    if _configured:
        return
    settings = get_settings()
    log_path = Path(settings.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(log_path)
    handler.setFormatter(logging.Formatter("%(message)s"))
    _logger.addHandler(handler)
    _logger.setLevel(logging.INFO)
    # Don't also send these lines to the root logger / stderr — stdio is
    # the MCP transport itself, so anything unexpected on stdout/stderr
    # can corrupt the protocol stream. The file handler above is the only
    # sink for this logger.
    _logger.propagate = False
    _configured = True


def _safe_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    """Truncates long string inputs (e.g. check_bom's base64 file content)
    before they hit the log — otherwise a single call can write megabytes
    into what's supposed to be a scannable audit trail."""
    safe: dict[str, Any] = {}
    for key, value in inputs.items():
        if isinstance(value, str) and len(value) > 200:
            safe[key] = f"<{len(value)} chars omitted>"
        else:
            safe[key] = value
    return safe


def _write_record(
    tool_name: str,
    inputs: dict[str, Any],
    success: bool,
    duration_ms: float,
    error: str | None,
    result: str | None = None,
) -> None:
    record: dict[str, Any] = {
        "timestamp": datetime.now(UTC).isoformat(),
        "tool": tool_name,
        "inputs": _safe_inputs(inputs),
        "success": success,
        "duration_ms": duration_ms,
    }
    if error is not None:
        record["error"] = error
    if result is not None:
        record["result"] = result[:1000]
    _logger.info(json.dumps(record))


async def run_logged(
    tool_name: str,
    inputs: dict[str, Any],
    body: Callable[[], Awaitable[str]],
    *,
    log_result: bool = False,
) -> str:
    """Every tool function's implementation is a zero-arg async callable
    passed in as `body` (usually a small closure). This runs it, times it,
    logs exactly one record, and converts the two expected failure modes
    into a readable string instead of propagating an exception:

    - PFAirConnectionError: the PF-AIR API couldn't be reached at all.
    - PFAirAPIError: PF-AIR responded with an error (404, 403, 422, 5xx).

    Write tools pass log_result=True so the log also records what actually
    happened (the created ECR's id, what was deducted) — not just that the
    call succeeded. Read tools don't, to keep their log lines small.

    Any other exception is a bug in this server, not an expected failure
    mode — it's logged the same way but re-raised, since swallowing it
    into a plain string would hide a real problem instead of surfacing it.
    """
    _configure()
    start = time.monotonic()
    try:
        result = await body()
    except PFAirConnectionError as exc:
        duration_ms = round((time.monotonic() - start) * 1000, 1)
        _write_record(tool_name, inputs, success=False, duration_ms=duration_ms, error=str(exc))
        return f"Couldn't reach the PF-AIR backend: {exc}"
    except PFAirAPIError as exc:
        duration_ms = round((time.monotonic() - start) * 1000, 1)
        _write_record(tool_name, inputs, success=False, duration_ms=duration_ms, error=str(exc))
        return f"PF-AIR returned an error: {exc.detail}"
    except Exception as exc:
        duration_ms = round((time.monotonic() - start) * 1000, 1)
        _write_record(
            tool_name,
            inputs,
            success=False,
            duration_ms=duration_ms,
            error=f"{type(exc).__name__}: {exc}",
        )
        raise
    else:
        duration_ms = round((time.monotonic() - start) * 1000, 1)
        _write_record(
            tool_name,
            inputs,
            success=True,
            duration_ms=duration_ms,
            error=None,
            result=result if log_result else None,
        )
        return result
