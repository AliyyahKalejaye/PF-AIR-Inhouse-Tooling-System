"""Preview-then-confirm support for the Phase 2 write tools.

Every write is split into two tools: a read-only `preview_*` tool that
works out exactly what would happen and returns a short confirmation code,
and a write tool that takes *only* that code. The write tool then performs
precisely the action that was previewed — the code carries the payload, so
the model can't preview one thing and submit something different.

What the code does NOT do is prove a human looked at the preview: the same
model that called the preview tool could pass the code straight back. The
real human checkpoint is the MCP client's tool-approval prompt on the write
tools (they're annotated as non-read-only so clients can ask before running
them). The code just guarantees "the thing you approved is the thing that
was previewed", and that a preview can't be reused or replayed later.

Codes are single-use, expire after CODE_TTL_SECONDS, and live only in this
server process's memory — a restart (or reinstalling the extension)
invalidates every outstanding code, which is the safe direction to fail.
"""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Any

from pfair_mcp.config import get_settings

CODE_TTL_SECONDS = 10 * 60


@dataclass
class PendingAction:
    kind: str
    payload: dict[str, Any]
    expires_at: float = field(default_factory=lambda: time.monotonic() + CODE_TTL_SECONDS)


class ConfirmationError(Exception):
    """The code is unknown, expired, already used, or for a different kind
    of action. The message is written to be shown to the user as-is."""


_pending: dict[str, PendingAction] = {}


def _purge_expired() -> None:
    now = time.monotonic()
    for code in [c for c, action in _pending.items() if action.expires_at <= now]:
        del _pending[code]


def issue(kind: str, payload: dict[str, Any]) -> str:
    _purge_expired()
    code = f"{kind.split('_')[0].upper()}-{secrets.token_hex(3).upper()}"
    _pending[code] = PendingAction(kind=kind, payload=payload)
    return code


def consume(code: str, kind: str) -> dict[str, Any]:
    """Return the previewed payload for `code` and invalidate the code.
    Raises ConfirmationError if it can't be used."""
    _purge_expired()
    action = _pending.get(code.strip())
    if action is None:
        raise ConfirmationError(
            f"Confirmation code {code!r} isn't valid — it may have expired (codes last "
            f"{CODE_TTL_SECONDS // 60} minutes), already been used, or come from before "
            "the server restarted. Run the preview again to get a fresh code."
        )
    if action.kind != kind:
        raise ConfirmationError(
            f"Confirmation code {code!r} is for a different kind of action. "
            "Run the matching preview tool to get a code for this one."
        )
    del _pending[code.strip()]
    return action.payload


def operator_missing() -> str | None:
    """Every write goes through the shared service account, so the
    operator name is the only record of who actually asked. Preview and
    write tools both refuse to run without it; returns the message to show,
    or None if it's set."""
    if get_settings().operator_name.strip():
        return None
    return (
        "Write actions are turned off: no operator name is configured. Set "
        "PFAIR_OPERATOR_NAME (or 'Your name' in the extension settings) so PF-AIR "
        "records who actually asked for this."
    )


def reset() -> None:
    """Test helper — drop every outstanding code."""
    _pending.clear()
