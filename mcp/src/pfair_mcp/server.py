"""Entrypoint for the PF-AIR MCP server (Phase 1: local, read-only, stdio
transport only — see mcp/README.md for the Claude Desktop config that
launches this).

Run directly with `python -m pfair_mcp.server`, or via the `pfair-mcp`
console script installed by this package (see pyproject.toml).
"""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer

from pfair_mcp.tools import register_all

mcp = MCPServer(
    name="pfair-tooling",
    instructions=(
        "Tools for querying Proforce Airsystems' in-house engineering tooling "
        "(PF-AIR): component inventory and stock levels, BOM checks, project "
        "progress and MIL (Minimum Item List) shortfalls, and Engineering "
        "Change Requests. All tools are read-only in this phase — nothing "
        "here creates, edits, approves, or deletes anything in PF-AIR."
    ),
)

register_all(mcp)


def main() -> None:
    mcp.run()  # defaults to stdio transport


if __name__ == "__main__":
    main()
