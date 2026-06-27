"""MCP Server + Adapter — 与 NestJS modules/mcp 像素级对齐。

NestJS MCP 关键设计：
- 标准 MCP stdio Server（@modelcontextprotocol/sdk）
- 3 个内置工具：bocha_search / memory_recall / knowledge_bank
- McpAdapter 把 MCP 工具注册到 McpRegistry
- LangGraph 节点可直接调用

Python 端用 mcp Python SDK（pip install mcp）。
"""
import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)


class MCPTool:
    """MCP 工具定义（与 NestJS mcp-registry 对齐）。"""

    def __init__(self, name: str, description: str, handler: Callable, enabled: bool = True):
        self.name = name
        self.description = description
        self.handler = handler
        self.enabled = enabled

    async def call(self, **kwargs) -> Any:
        if not self.enabled:
            raise RuntimeError(f"MCP tool {self.name} is disabled")
        return await self.handler(**kwargs)


class McpRegistry:
    """MCP 工具注册表（与 NestJS McpRegistry 像素级对齐）。"""

    _instance: "McpRegistry | None" = None

    def __init__(self):
        self._tools: dict[str, MCPTool] = {}

    @classmethod
    def instance(cls) -> "McpRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register(self, tool: MCPTool) -> None:
        self._tools[tool.name] = tool
        logger.info(f"MCP registered: {tool.name}")

    def unregister(self, name: str) -> None:
        if name in self._tools:
            del self._tools[name]

    def enable(self, name: str) -> None:
        if name in self._tools:
            self._tools[name].enabled = True

    def disable(self, name: str) -> None:
        if name in self._tools:
            self._tools[name].enabled = False

    def is_enabled(self, name: str) -> bool:
        return self._tools.get(name, MCPTool(name, "", lambda: None)).enabled

    def list_tools(self) -> list[dict]:
        return [
            {"name": t.name, "description": t.description, "enabled": t.enabled}
            for t in self._tools.values()
        ]

    def get_tool(self, name: str) -> MCPTool | None:
        return self._tools.get(name)

    async def call(self, name: str, **kwargs) -> Any:
        tool = self.get_tool(name)
        if not tool:
            raise KeyError(f"MCP tool not found: {name}")
        return await tool.call(**kwargs)


# ============================================================
# 内置 3 个工具
# ============================================================


async def bocha_search_handler(query: str, max_results: int = 5) -> dict:
    """Bocha 联网搜索（无 BOCHA_API_KEY 时返回 mock）。"""
    from interview_agent.config import settings

    if not settings.BOCHA_API_KEY or "placeholder" in settings.BOCHA_API_KEY:
        return {
            "query": query,
            "results": [
                {
                    "title": f"[Mock] 关于 '{query}' 的搜索结果",
                    "url": "https://example.com",
                    "snippet": f"这是 {query} 的模拟搜索结果（无 BOCHA_API_KEY）。",
                }
            ][:max_results],
            "mock": True,
        }

    # 真实现：调 Bocha API
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.BOCHA_BASE_URL}/web-search",
                headers={"Authorization": f"Bearer {settings.BOCHA_API_KEY}"},
                json={"query": query, "summary": True, "count": max_results},
                timeout=10,
            )
            return resp.json()
    except Exception as e:
        logger.warning(f"Bocha search failed: {e}")
        return {"query": query, "results": [], "error": str(e)}


async def memory_recall_handler(user_id: str, query: str, top_k: int = 5) -> dict:
    """长期记忆召回。"""
    from interview_agent.modules.memory.memory import l3_search
    results = await l3_search(user_id, query, top_k=top_k)
    return {"userId": user_id, "query": query, "results": results}


async def knowledge_bank_handler(query: str, domain: str | None = None, top_k: int = 5) -> dict:
    """知识库召回。"""
    from interview_agent.modules.knowledge_base.knowledge_banks import (
        recall_questions,
    )
    results = recall_questions(query, domain=domain, top_k=top_k)
    return {"query": query, "domain": domain, "results": results}


def register_builtin_tools() -> None:
    """注册 3 个内置工具。"""
    registry = McpRegistry.instance()
    registry.register(MCPTool(
        name="bocha_search",
        description="联网搜索（Bocha API）",
        handler=bocha_search_handler,
    ))
    registry.register(MCPTool(
        name="memory_recall",
        description="长期记忆召回（Mem0/Milvus）",
        handler=memory_recall_handler,
    ))
    registry.register(MCPTool(
        name="knowledge_bank",
        description="题库知识库召回（5 领域）",
        handler=knowledge_bank_handler,
    ))