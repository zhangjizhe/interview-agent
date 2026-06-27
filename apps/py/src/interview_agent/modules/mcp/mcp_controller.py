"""MCP Controller — 与 NestJS admin-mcp.controller.ts + tools.controller.ts 像素级对齐。

路由：
- GET  /api/tools                           — 工具列表（list schema）
- GET  /api/admin/mcp                       — MCP 工具管理（listWithStatus schema）
- POST /api/admin/mcp/:toolId/toggle        — 启停工具
- GET  /api/admin/mcp-servers               — 所有 MCP server + 运行时状态
- POST /api/admin/mcp-servers/toggle        — 切换系统级启停
- GET  /api/admin/mcp-servers/:name/health  — 单个 server 健康检查
- POST /api/admin/mcp-servers/reload        — 重新加载 config
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from interview_agent.modules.mcp.mcp_registry import (
    McpRegistry,
    register_builtin_tools,
)

logger = logging.getLogger(__name__)

tools_router = APIRouter(tags=["tools"])
mcp_admin_router = APIRouter(tags=["mcp-admin"])
admin_mcp_servers_router = APIRouter(prefix="/admin/mcp-servers", tags=["admin-mcp-servers"])


def _ensure_registered() -> None:
    """确保 9 个 builtin tools 都注册了（lifespan 也会调，但这里兜底）。"""
    register_builtin_tools()


@tools_router.get("")
async def list_tools() -> dict:
    """工具列表（前端 SkillsMarket 用）。

    对齐 NestJS tools.controller.list() — 每个 tool 返 {name, description, enabled}。
    """
    _ensure_registered()
    registry = McpRegistry.instance()
    tools = registry.list()
    return {"tools": tools, "count": len(tools)}


@mcp_admin_router.get("")
async def list_mcp_admin() -> dict:
    """MCP 工具管理（前端 /tools 页 admin 视图）。

    对齐 NestJS admin-mcp.controller / NestJS McpRegistry.listWithStatus() —
    每个 server 含 transport/builtin/status/lastHealthCheck。
    """
    _ensure_registered()
    registry = McpRegistry.instance()
    servers = registry.list_with_status()
    return {
        "servers": servers,
        "count": len(servers),
        "runningCount": sum(1 for s in servers if s["status"] in ("running", "builtin")),
    }


@mcp_admin_router.post("/{tool_id}/toggle")
async def toggle_mcp_tool(tool_id: str, enabled: bool = True) -> dict:
    """启/停 MCP 工具（系统级）。"""
    _ensure_registered()
    registry = McpRegistry.instance()
    ok = registry.set_system_enabled(tool_id, enabled)
    if not ok:
        raise HTTPException(status_code=404, detail=f"MCP tool not found: {tool_id}")
    return {"toolId": tool_id, "enabled": registry.is_enabled(tool_id)}


# ============================================================
# /api/admin/mcp-servers/* 路由（与 NestJS admin-mcp.controller 对齐）
# ============================================================


class ToggleRequest(BaseModel):
    toolName: str
    enabled: bool


@admin_mcp_servers_router.get("")
async def list_mcp_servers() -> dict:
    """所有 MCP server + 运行时状态（与 NestJS AdminMcpController.list 1:1）。

    对齐 NestJS：servers 含 {name, displayName, description, emoji, category, ...}
    + transport/builtin/status/lastHealthCheck。
    """
    _ensure_registered()
    registry = McpRegistry.instance()
    servers = registry.list_with_status()
    return {
        "servers": servers,
        "count": len(servers),
        "runningCount": sum(1 for s in servers if s["status"] in ("running", "builtin")),
    }


@admin_mcp_servers_router.post("/toggle")
async def toggle_mcp_server(body: ToggleRequest) -> dict:
    """切换 MCP 系统级启停。

    对齐 NestJS AdminMcpController.toggle：toolName + enabled → setSystemEnabled。
    """
    _ensure_registered()
    registry = McpRegistry.instance()
    ok = registry.set_system_enabled(body.toolName, body.enabled)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {body.toolName}")
    return {"ok": True, "toolName": body.toolName, "enabled": body.enabled}


@admin_mcp_servers_router.get("/{name}/health")
async def mcp_server_health(name: str) -> dict:
    """单个 server 健康检查。

    对齐 NestJS McpRegistry.healthCheck：builtin 永远 ok；外部按 transport 走。
    Python 端无外部 MCP，全部 builtin → 全部返 ok。
    """
    _ensure_registered()
    registry = McpRegistry.instance()
    result = await registry.health_check(name)
    return {"name": name, **result}


@admin_mcp_servers_router.post("/reload")
async def reload_mcp_config() -> dict:
    """重新加载 MCP config（Python 端无外部 config，永远 ok）。"""
    _ensure_registered()
    return {"ok": True, "loaded": 9, "errors": []}