"""Registers every tool module's functions with the MCPServer instance.
Called once from server.py at startup."""

from mcp.server.mcpserver import MCPServer

from pfair_mcp.tools import bom, components, ecr, projects


def register_all(mcp: MCPServer) -> None:
    components.register(mcp)
    bom.register(mcp)
    projects.register(mcp)
    ecr.register(mcp)
