"""Admin + Tools + Vitals + HITL · 2026-06-25 web ↔ py-api 对齐 P2

补 7 个 web 调用的 endpoint：

Admin MCP（4 个）：
1. GET  /api/admin/mcp-servers                → {servers, count, runningCount}
2. POST /api/admin/mcp-servers/toggle          {toolName, enabled} → {ok}
3. POST /api/admin/mcp-servers/reload          → {ok}
4. GET  /api/admin/mcp-servers/{name}/health   → {healthy, latencyMs}

Tools（2 个）：
5. GET  /api/tools?userId                     → {tools, count, enabledCount}
6. GET/POST /api/tools/preferences             {userId, toolName, enabled} → {ok}

Vitals + HITL + Empty-rooms（3 个）：
7. POST /api/metrics/vitals                   {vitals: [...]} → {ok}
8. GET  /api/hitl/graph-status/{interviewId}   → {isHitlPending, score, issues, suggestion}
9. POST /api/hitl/graph-resume/{interviewId}  {verdict} → {success}
10. GET  /api/interview/empty-rooms?userId&idleMinutes → {emptyRooms, count}
"""
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import structlog

logger = structlog.get_logger(__name__)

router = APIRouter()

# === Mock MCP servers（dev 占位，商用前接 MCP Registry） ===

MOCK_MCP_SERVERS = [
    {"name": "playwright", "transport": "stdio", "status": "running", "enabled": True, "tools": ["browser_navigate", "browser_click"]},
    {"name": "github", "transport": "stdio", "status": "stopped", "enabled": False, "tools": []},
    {"name": "fetch", "transport": "http", "status": "running", "enabled": True, "tools": ["fetch_url"]},
    {"name": "filesystem", "transport": "stdio", "status": "running", "enabled": True, "tools": ["read_file", "write_file"]},
]

MOCK_TOOLS = [
    {"name": "web_search", "description": "网页搜索", "category": "search", "enabled": True, "transport": "http"},
    {"name": "code_runner", "description": "Python 代码执行", "category": "execute", "enabled": True, "transport": "stdio"},
    {"name": "file_reader", "description": "读本地文件", "category": "file", "enabled": False, "transport": "stdio"},
]


# === 1. GET /api/admin/mcp-servers ===

@router.get("/admin/mcp-servers")
async def admin_mcp_servers():
    """列 MCP server 状态"""
    return {
        "servers": MOCK_MCP_SERVERS,
        "count": len(MOCK_MCP_SERVERS),
        "runningCount": sum(1 for s in MOCK_MCP_SERVERS if s.get("status") == "running"),
    }


# === 2. POST /api/admin/mcp-servers/toggle ===

class ToggleRequest(BaseModel):
    toolName: str
    enabled: bool


@router.post("/admin/mcp-servers/toggle")
async def admin_mcp_toggle(req: ToggleRequest):
    """启停 MCP server"""
    for s in MOCK_MCP_SERVERS:
        if s["name"] == req.toolName:
            s["enabled"] = req.enabled
            s["status"] = "running" if req.enabled else "stopped"
            logger.info("mcp_toggled", name=req.toolName, enabled=req.enabled)
            return {"ok": True, "name": req.toolName, "enabled": req.enabled}
    raise HTTPException(status_code=404, detail="MCP server not found")


# === 3. POST /api/admin/mcp-servers/reload ===

@router.post("/admin/mcp-servers/reload")
async def admin_mcp_reload():
    """重新加载 MCP 配置（dev 占位）"""
    logger.info("mcp_reload")
    return {"ok": True, "reloaded": len(MOCK_MCP_SERVERS)}


# === 4. GET /api/admin/mcp-servers/{name}/health ===

@router.get("/admin/mcp-servers/{name}/health")
async def admin_mcp_health(name: str):
    """MCP server 健康检查"""
    start = time.perf_counter()
    # dev 模拟
    await asyncio_sleep(0.05)  # 50ms 模拟
    latency_ms = int((time.perf_counter() - start) * 1000)

    server = next((s for s in MOCK_MCP_SERVERS if s["name"] == name), None)
    if not server:
        raise HTTPException(status_code=404, detail="MCP server not found")

    return {
        "name": name,
        "healthy": server.get("status") == "running",
        "latencyMs": latency_ms,
        "status": server.get("status"),
    }


async def asyncio_sleep(seconds: float):
    """helper"""
    import asyncio
    await asyncio.sleep(seconds)


# === 5. GET /api/tools ===

@router.get("/tools")
async def list_tools(userId: Optional[str] = None):
    """列工具（userId 决定用户偏好，dev 简化用全局）"""
    enabled_count = sum(1 for t in MOCK_TOOLS if t.get("enabled"))
    return {
        "tools": MOCK_TOOLS,
        "count": len(MOCK_TOOLS),
        "enabledCount": enabled_count,
    }


# === 6. GET/POST /api/tools/preferences ===

class PreferencesRequest(BaseModel):
    userId: str
    toolName: str
    enabled: bool


@router.get("/tools/preferences")
async def get_preferences(userId: str):
    """用户偏好（dev 占位：返回全部 enabled）"""
    return {
        "userId": userId,
        "preferences": [{"toolName": t["name"], "enabled": t.get("enabled", False)} for t in MOCK_TOOLS],
    }


@router.post("/tools/preferences")
async def set_preferences(req: PreferencesRequest):
    """设置用户偏好"""
    for t in MOCK_TOOLS:
        if t["name"] == req.toolName:
            t["enabled"] = req.enabled
            logger.info("tool_preference_set", user_id=req.userId, tool=req.toolName, enabled=req.enabled)
            return {"ok": True, "userId": req.userId, "toolName": req.toolName, "enabled": req.enabled}
    raise HTTPException(status_code=404, detail="Tool not found")


# === 7. POST /api/metrics/vitals ===

class VitalsRequest(BaseModel):
    vitals: List[dict]


@router.post("/metrics/vitals")
async def metrics_vitals(req: VitalsRequest):
    """前端 Web Vitals 上报（dev 占位：log + count）"""
    for v in req.vitals:
        # v 格式：{name: 'CLS' | 'LCP' | ..., value: number, id: '...'}
        logger.info("web_vital", name=v.get("name"), value=v.get("value"), id=v.get("id"))
    return {"ok": True, "received": len(req.vitals)}


# === 8. GET /api/hitl/graph-status/{interview_id} ===

@router.get("/hitl/graph-status/{interview_id}")
async def hitl_status(interview_id: str):
    """查 HITL pending 状态

    dev 简化：返回非 pending（用户可走流程）
    商用：查 LangGraph checkpointer 是否有 interrupt 节点
    """
    return {
        "isHitlPending": False,
        "score": None,
        "issues": [],
        "suggestion": None,
    }


# === 9. POST /api/hitl/graph-resume/{interview_id} ===

class HitlResumeRequest(BaseModel):
    verdict: str  # approved / rejected


@router.post("/hitl/graph-resume/{interview_id}")
async def hitl_resume(interview_id: str, req: HitlResumeRequest):
    """HITL 审批：恢复 graph"""
    if req.verdict not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="verdict must be approved or rejected")
    logger.info("hitl_resume", interview_id=interview_id, verdict=req.verdict)
    return {"success": True, "interviewId": interview_id, "verdict": req.verdict}


# === 10. GET /api/interview/empty-rooms ===

@router.get("/interview/empty-rooms")
async def empty_rooms(userId: str, idleMinutes: int = 30):
    """查空面试（idleMinutes 无消息）

    dev 简化：返回空 list
    """
    # 商用：查 DB 找 last_message_at < now - idleMinutes 的 interview
    return {"emptyRooms": [], "count": 0}