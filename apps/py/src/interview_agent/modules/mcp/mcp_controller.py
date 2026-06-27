"""MCP Controller — 与 NestJS admin-mcp.controller.ts + tools.controller.ts 像素级对齐。

路由：
- GET  /api/tools               — 工具列表
- GET  /api/admin/mcp           — MCP 工具管理（系统级）
- POST /api/admin/mcp/:toolId/toggle — 启停工具
"""
import logging

from fastapi import APIRouter, HTTPException

from interview_agent.modules.mcp.mcp_registry import (
    McpRegistry,
    register_builtin_tools,
)

logger = logging.getLogger(__name__)

tools_router = APIRouter(tags=["tools"])
mcp_admin_router = APIRouter(tags=["mcp-admin"])


@tools_router.get("")
async def list_tools() -> dict:
    """工具列表（含 MCP 工具 + 内置工具）。"""
    register_builtin_tools()  # ensure registered
    registry = McpRegistry.instance()
    return {"tools": registry.list_tools(), "count": len(registry.list_tools())}


@mcp_admin_router.get("")
async def list_mcp_admin() -> dict:
    """MCP 工具管理（系统级）。"""
    register_builtin_tools()
    registry = McpRegistry.instance()
    return {"tools": registry.list_tools()}


@mcp_admin_router.post("/{tool_id}/toggle")
async def toggle_mcp_tool(tool_id: str, enabled: bool = True) -> dict:
    """启/停 MCP 工具。"""
    register_builtin_tools()
    registry = McpRegistry.instance()
    tool = registry.get_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail=f"MCP tool not found: {tool_id}")
    if enabled:
        registry.enable(tool_id)
    else:
        registry.disable(tool_id)
    return {"toolId": tool_id, "enabled": registry.is_enabled(tool_id)}