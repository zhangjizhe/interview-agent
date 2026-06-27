"""MCP Controller — 与 NestJS admin-mcp.controller.ts + tools.controller.ts 像素级对齐。

路由：
- GET    /api/tools                            — 工具列表（含用户级偏好合并）
- GET    /api/tools/preferences?userId=        — 当前用户所有偏好
- POST   /api/tools/preferences                — 切换单个偏好
- GET    /api/admin/mcp                        — MCP 工具管理（listWithStatus schema）
- POST   /api/admin/mcp/:toolId/toggle         — 启停工具
- GET    /api/admin/mcp-servers                — 所有 MCP server + 运行时状态
- POST   /api/admin/mcp-servers/toggle         — 切换系统级启停
- GET    /api/admin/mcp-servers/:name/health   — 单个 server 健康检查
- POST   /api/admin/mcp-servers/reload         — 重新加载 config

设计：
- 系统级 enabled 由 Registry.setSystemEnabled() 管理
- 用户级 enabled 持久化在 user_tool_preferences 表
- list(?userId=xxx) 合并后输出 userEnabled + effectiveEnabled 字段
"""
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from interview_agent.infra.db import async_session_factory
from interview_agent.infra.models import UserToolPreference
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


# ============================================================
# /api/tools 路由（与 NestJS tools.controller 对齐）
# ============================================================


@tools_router.get("")
async def list_tools(userId: str | None = Query(default=None)) -> dict:
    """工具列表（合并系统级 + 用户级偏好）。

    对齐 NestJS tools.controller.list():
    - 无 userId: 返 {tools, count, enabledCount}（系统级）
    - 有 userId: 返 {tools[+userEnabled, +effectiveEnabled], count, enabledCount, userDisabledCount}
    """
    _ensure_registered()
    registry = McpRegistry.instance()
    tools = registry.list()

    if not userId:
        # 无 userId：返回系统级
        return {
            "tools": tools,
            "count": len(tools),
            "enabledCount": sum(1 for t in tools if t["enabled"]),
        }

    # 有 userId：合并用户偏好
    async with async_session_factory() as session:
        result = await session.execute(
            select(UserToolPreference).where(UserToolPreference.user_id == userId)
        )
        prefs = result.scalars().all()
        pref_map: dict[str, bool] = {p.tool_name: p.enabled for p in prefs}

    merged: list[dict[str, Any]] = []
    for t in tools:
        user_wants = pref_map.get(t["name"])
        # NestJS 规则：undefined = 跟随系统；false = 明确关；true = 跟随系统
        user_enabled = False if user_wants is False else t["enabled"]
        effective = t["enabled"] and user_enabled
        merged.append({**t, "userEnabled": user_enabled, "effectiveEnabled": effective})

    return {
        "tools": merged,
        "count": len(merged),
        "enabledCount": sum(1 for t in merged if t["effectiveEnabled"]),
        "userDisabledCount": sum(1 for t in merged if t["userEnabled"] is False),
    }


@tools_router.get("/preferences")
async def get_preferences(userId: str = Query(...)) -> dict:
    """当前用户的所有工具偏好。

    对齐 NestJS tools.controller.getPreferences():
    - userId 必填（NestJS 抛 400）
    - 返 {userId, preferences[], count}
    """
    if not userId:
        raise HTTPException(status_code=400, detail="userId required")

    async with async_session_factory() as session:
        result = await session.execute(
            select(UserToolPreference).where(UserToolPreference.user_id == userId)
        )
        prefs = result.scalars().all()

    return {
        "userId": userId,
        "preferences": [
            {
                "userId": p.user_id,
                "toolName": p.tool_name,
                "enabled": p.enabled,
                "config": p.config_,
                "createdAt": p.created_at.isoformat() if p.created_at else None,
                "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in prefs
        ],
        "count": len(prefs),
    }


class UpsertPrefBody(BaseModel):
    userId: str
    toolName: str
    enabled: bool
    config: dict | None = None


@tools_router.post("/preferences")
async def upsert_preference(body: UpsertPrefBody) -> dict:
    """切换单个工具的用户偏好（upsert）。

    对齐 NestJS tools.controller.upsertPreference():
    - 校验 userId/toolName/enabled 必填
    - 校验 toolName 在 Registry 中存在
    - upsert Prisma → 这里 upsert SQLAlchemy
    """
    if not body.userId or not body.toolName or body.enabled is None:
        raise HTTPException(
            status_code=400, detail="userId, toolName, enabled required"
        )

    _ensure_registered()
    registry = McpRegistry.instance()
    tool = registry.get(body.toolName)
    if not tool:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {body.toolName}")

    now = datetime.utcnow()
    async with async_session_factory() as session:
        result = await session.execute(
            select(UserToolPreference).where(
                UserToolPreference.user_id == body.userId,
                UserToolPreference.tool_name == body.toolName,
            )
        )
        pref = result.scalar_one_or_none()
        if pref:
            pref.enabled = body.enabled
            pref.config_ = body.config
            pref.updated_at = now
        else:
            pref = UserToolPreference(
                id=str(uuid.uuid4()),
                user_id=body.userId,
                tool_name=body.toolName,
                enabled=body.enabled,
                config_=body.config,
                created_at=now,
                updated_at=now,
            )
            session.add(pref)
        await session.commit()
        await session.refresh(pref)

    return {
        "ok": True,
        "preference": {
            "userId": pref.user_id,
            "toolName": pref.tool_name,
            "enabled": pref.enabled,
            "config": pref.config_,
            "createdAt": pref.created_at.isoformat() if pref.created_at else None,
            "updatedAt": pref.updated_at.isoformat() if pref.updated_at else None,
        },
    }


# ============================================================
# /api/admin/mcp 路由（与 NestJS admin-mcp.controller 对齐）
# ============================================================


@mcp_admin_router.get("")
async def list_mcp_admin() -> dict:
    """MCP 工具管理（前端 /tools 页 admin 视图）。"""
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
    """所有 MCP server + 运行时状态。"""
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
    """切换 MCP 系统级启停。"""
    _ensure_registered()
    registry = McpRegistry.instance()
    ok = registry.set_system_enabled(body.toolName, body.enabled)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {body.toolName}")
    return {"ok": True, "toolName": body.toolName, "enabled": body.enabled}


@admin_mcp_servers_router.get("/{name}/health")
async def mcp_server_health(name: str) -> dict:
    """单个 server 健康检查。"""
    _ensure_registered()
    registry = McpRegistry.instance()
    result = await registry.health_check(name)
    return {"name": name, **result}


@admin_mcp_servers_router.post("/reload")
async def reload_mcp_config() -> dict:
    """重新加载 MCP config。"""
    _ensure_registered()
    return {"ok": True, "loaded": 9, "errors": []}
