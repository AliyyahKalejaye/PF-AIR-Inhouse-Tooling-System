"""Turning what a person types ("the 2212 motors", a UUID) into a real
PF-AIR inventory component, shared by every tool that links to one (parts
lists, inventory edits).

Matching is deliberately strict: a UUID, or a name that's identical once
case, spaces and punctuation are stripped — the same normalisation the
backend's bulk import uses (app/services/bulk_import.py's _normalize_key).
Anything looser returns the candidates instead of guessing, because a
parts-list entry pointing at the wrong part (an M3x10 screw instead of an
M3x12) is worse than asking.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from pfair_mcp.client import PFAirAPIError, get_client

_PAGE = 200


def normalize_key(value: str | None) -> str:
    """Mirror of backend app/services/bulk_import.py's _normalize_key."""
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value.strip())
    except ValueError:
        return False
    return True


async def all_components() -> list[dict[str, Any]]:
    """Every component in inventory, paging through GET /components
    (it caps `limit` at 200)."""
    client = get_client()
    items: list[dict[str, Any]] = []
    offset = 0
    while True:
        page = await client.get("/components", params={"limit": _PAGE, "offset": offset})
        items.extend(page["items"])
        offset += len(page["items"])
        if not page["items"] or offset >= page["total"]:
            return items


async def resolve_component(ref: str) -> tuple[dict[str, Any] | None, str | None]:
    """Returns (component, None) on a confident match, else (None, message)
    where the message lists candidates when there are any."""
    ref = ref.strip()
    client = get_client()

    if is_uuid(ref):
        try:
            return await client.get(f"/components/{ref}"), None
        except PFAirAPIError as exc:
            if exc.status_code == 404:
                return None, f"No inventory part with id {ref}."
            raise

    page = await client.get("/components", params={"q": ref, "limit": _PAGE})
    hits = page["items"]
    key = normalize_key(ref)
    exact = [c for c in hits if normalize_key(c["name"]) == key]
    if not exact:
        # The search is a plain substring match, so "ESC-30A" won't find
        # "ESC 30A". Fall back to comparing normalised names across the
        # whole inventory before giving up.
        exact = [c for c in await all_components() if normalize_key(c["name"]) == key]
    if len(exact) == 1:
        return exact[0], None

    candidates = exact or hits
    if not candidates:
        return None, f"No inventory part matches {ref!r}."
    listed = "\n".join(
        f"  - {c['name']}"
        + (f" ({c['brand']})" if c.get("brand") else "")
        + f", {c['quantity']} in stock, id={c['id']}"
        for c in candidates[:10]
    )
    more = f"\n  …and {len(candidates) - 10} more" if len(candidates) > 10 else ""
    return None, f"{ref!r} isn't an exact match for one part. Possible matches:\n{listed}{more}"
