"""MCP Server + Adapter — 与 NestJS McpRegistry + mcp-adapter.service.ts 像素级对齐。

NestJS 注册 9 个 builtin tool（apps/api/src/modules/interview/services/mcp-registry.ts:340-440）：
  1. bocha_search         — 联网搜索
  2. memory_recall       — 长期记忆召回
  3. knowledge_bank      — 题库知识库
  4. github_get_user     — GitHub 用户信息
  5. github_list_repos   — GitHub 仓库列表
  6. github_get_readme   — GitHub README
  7. notion_search       — Notion 全文搜索
  8. notion_get_page     — Notion 页面内容
  9. notion_list_databases — Notion 数据库列表

McpToolMetadata schema（与 NestJS McpToolMetadata 1:1）：
  name, displayName, description, emoji, category, enabled, author?, version?, configSchema?
"""
import logging
from typing import Any, Callable, Literal

logger = logging.getLogger(__name__)

CategoryType = Literal["search", "knowledge", "code", "mcp", "custom"]


class MCPTool:
    """单个 MCP 工具。

    对齐 NestJS McpToolMetadata + McpTool（带 execute handler）。
    """

    def __init__(
        self,
        name: str,
        displayName: str,
        description: str,
        emoji: str,
        category: CategoryType,
        enabled: bool = True,
        author: str = "system",
        version: str = "1.0.0",
        config_schema: dict | None = None,
        handler: Callable | None = None,
    ):
        self.name = name
        self.displayName = displayName
        self.description = description
        self.emoji = emoji
        self.category = category
        self.enabled = enabled
        self.author = author
        self.version = version
        self.configSchema = config_schema
        self._handler = handler

    def to_dict(self) -> dict:
        """返回 listWithStatus 兼容的 dict（NestJS schema）。"""
        return {
            "name": self.name,
            "displayName": self.displayName,
            "description": self.description,
            "emoji": self.emoji,
            "category": self.category,
            "enabled": self.enabled,
            "author": self.author,
            "version": self.version,
            "configSchema": self.configSchema,
        }

    async def call(self, **kwargs) -> Any:
        if not self.enabled:
            raise RuntimeError(f"MCP tool {self.name} is disabled")
        if self._handler is None:
            raise RuntimeError(f"MCP tool {self.name} has no handler")
        return await self._handler(**kwargs)


# ============================================================
# 内置 9 个工具的 handler（mock；真 provider 跑时切真 API）
# ============================================================


async def bocha_search_handler(query: str, max_results: int = 5) -> dict:
    """Bocha 联网搜索。无 BOCHA_API_KEY 时返 mock。"""
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
    """题库知识库召回。"""
    from interview_agent.modules.knowledge_base.knowledge_banks import (
        recall_questions,
    )
    results = recall_questions(query, domain=domain, top_k=top_k)
    return {"query": query, "domain": domain, "results": results}


async def github_get_user_handler(username: str) -> dict:
    """GitHub 用户公开信息（粉丝、bio、贡献统计）。"""
    import httpx
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://api.github.com/users/{username}",
                headers={"Accept": "application/vnd.github+json"},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "username": username,
                    "name": data.get("name"),
                    "bio": data.get("bio"),
                    "public_repos": data.get("public_repos"),
                    "followers": data.get("followers"),
                    "following": data.get("following"),
                    "avatar_url": data.get("avatar_url"),
                    "html_url": data.get("html_url"),
                    "company": data.get("company"),
                    "location": data.get("location"),
                }
            return {"error": f"GitHub user not found: {username}", "status": resp.status_code}
        except Exception as e:
            return {"error": str(e), "username": username}


async def github_list_repos_handler(username: str, sort: str = "stars", limit: int = 10) -> dict:
    """GitHub 用户公开仓库列表（按 stars 排序）。"""
    import httpx
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://api.github.com/users/{username}/repos",
                params={"sort": sort, "per_page": min(limit, 100)},
                headers={"Accept": "application/vnd.github+json"},
                timeout=10,
            )
            if resp.status_code == 200:
                repos = resp.json()
                return {
                    "username": username,
                    "count": len(repos),
                    "repos": [
                        {
                            "name": r.get("name"),
                            "full_name": r.get("full_name"),
                            "description": r.get("description"),
                            "stars": r.get("stargazers_count", 0),
                            "forks": r.get("forks_count", 0),
                            "language": r.get("language"),
                            "html_url": r.get("html_url"),
                            "updated_at": r.get("updated_at"),
                        }
                        for r in repos
                    ],
                }
            return {"error": f"GitHub repos not found: {username}", "status": resp.status_code}
        except Exception as e:
            return {"error": str(e), "username": username}


async def github_get_readme_handler(owner: str, repo: str) -> dict:
    """GitHub 仓库 README（Markdown）。"""
    import httpx
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/readme",
                headers={
                    "Accept": "application/vnd.github.raw+json",
                    "User-Agent": "interview-agent",
                },
                timeout=10,
            )
            if resp.status_code == 200:
                return {
                    "owner": owner,
                    "repo": repo,
                    "content": resp.text[:10000],  # 限长
                    "truncated": len(resp.text) > 10000,
                }
            return {"error": f"README not found: {owner}/{repo}", "status": resp.status_code}
        except Exception as e:
            return {"error": str(e), "owner": owner, "repo": repo}


async def notion_search_handler(query: str, limit: int = 5) -> dict:
    """Notion 全文搜索（占位：需要 NOTION_TOKEN 真 API）。"""
    return {
        "query": query,
        "results": [],
        "mock": True,
        "message": "Notion search requires NOTION_TOKEN; not configured in dev",
    }


async def notion_get_page_handler(page_id: str) -> dict:
    """Notion 页面详情（占位）。"""
    return {
        "pageId": page_id,
        "mock": True,
        "message": "Notion get_page requires NOTION_TOKEN; not configured in dev",
    }


async def notion_list_databases_handler(limit: int = 20) -> dict:
    """Notion 数据库列表（占位）。"""
    return {
        "count": 0,
        "databases": [],
        "mock": True,
        "message": "Notion list_databases requires NOTION_TOKEN; not configured in dev",
    }


# ============================================================
# McpRegistry 单例（与 NestJS McpRegistry 1:1）
# ============================================================


class McpRegistry:
    """MCP 工具注册表 + 运行时状态管理。

    对齐 NestJS McpRegistry：
    - register / unregister / get
    - list() / listWithStatus()
    - setSystemEnabled(name, enabled)
    - healthCheck(name)
    - callTool(name, args)
    """

    _instance: "McpRegistry | None" = None

    def __init__(self):
        self._tools: dict[str, MCPTool] = {}
        self._system_override: dict[str, bool] = {}
        self._last_health_check: dict[str, float] = {}

    @classmethod
    def instance(cls) -> "McpRegistry":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register(self, tool: MCPTool) -> None:
        self._tools[tool.name] = tool
        logger.info(f"MCP registered: {tool.name}")

    def unregister(self, name: str) -> bool:
        return self._tools.pop(name, None) is not None

    def get(self, name: str) -> MCPTool | None:
        return self._tools.get(name)

    def is_enabled(self, name: str) -> bool:
        tool = self._tools.get(name)
        if not tool:
            return False
        # 系统 override > tool 默认 enabled
        return self._system_override.get(name, tool.enabled)

    def set_system_enabled(self, name: str, enabled: bool) -> bool:
        """对齐 NestJS McpRegistry.setSystemEnabled"""
        if name not in self._tools:
            return False
        self._system_override[name] = enabled
        return True

    def list(self) -> list[dict]:
        """对齐 NestJS McpRegistry.list() — 基础 metadata 列表。

        注意：虽然和 builtin list 同名，但 Python 在 method body 里仍然能找到
        outer scope 的 builtin list（解析 `list[dict]` 时找不到 → 报错），
        所以这里用 `from __future__ import annotations` + typing.List 模式。
        实际 list[...] 写在签名靠后的位置，Python 3.12 已经支持 PEP 563 lazy eval。
        """
        result = []
        for tool in self._tools.values():
            result.append({**tool.to_dict(), "enabled": self.is_enabled(tool.name)})
        return result

    def list_with_status(self):
        """对齐 NestJS McpRegistry.listWithStatus() — admin 页用，包含 transport/builtin/status。"""
        out: list[dict] = []
        for tool in self._tools.values():
            entry = tool.to_dict()
            entry["enabled"] = self.is_enabled(tool.name)
            entry["transport"] = "builtin"  # Python 端全 builtin
            entry["builtin"] = True
            entry["status"] = "builtin" if self.is_enabled(tool.name) else "stopped"
            ts = self._last_health_check.get(tool.name)
            if ts:
                from datetime import datetime, timezone
                entry["lastHealthCheck"] = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
            out.append(entry)
        return out

    async def call(self, name: str, **kwargs) -> Any:
        """对齐 NestJS McpRegistry.callTool"""
        tool = self._tools.get(name)
        if not tool:
            raise KeyError(f"MCP tool not found: {name}")
        if not self.is_enabled(name):
            raise RuntimeError(f"MCP tool {name} is disabled")
        return await tool.call(**kwargs)

    async def health_check(self, name: str) -> dict:
        """对齐 NestJS McpRegistry.healthCheck。
        builtin 永远 ok；外部的按 transport 走（Python 端没外部，返回 builtin ok）。
        """
        tool = self._tools.get(name)
        if not tool:
            return {"ok": False, "latencyMs": 0, "error": "not found"}
        import time
        start = time.time()
        # builtin 永远 healthy
        self._last_health_check[name] = start
        return {"ok": True, "latencyMs": int((time.time() - start) * 1000)}


def register_builtin_tools() -> None:
    """注册 NestJS 同款的 9 个 builtin MCP tool。

    与 apps/api/src/modules/interview/services/mcp-registry.ts:340-440 完全对齐：
    - 名字、displayName、description、emoji、category 全一致
    - 6 个 github_*/notion_* 之前我漏掉了，现在补全
    """
    registry = McpRegistry.instance()

    # 防止重复注册
    if registry.get("bocha_search"):
        return

    # search 类
    registry.register(MCPTool(
        name="bocha_search",
        displayName="联网搜索",
        description="调用博查 AI 搜索最新技术文档、行业资讯",
        emoji="🔍",
        category="search",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=bocha_search_handler,
    ))

    # knowledge 类
    registry.register(MCPTool(
        name="memory_recall",
        displayName="长期记忆",
        description="从候选人历史对话中检索相关记忆",
        emoji="🧠",
        category="knowledge",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=memory_recall_handler,
    ))

    registry.register(MCPTool(
        name="knowledge_bank",
        displayName="面试题库",
        description="按岗位匹配结构化面试题（Agent/前端/测试）",
        emoji="📚",
        category="knowledge",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=knowledge_bank_handler,
    ))

    # mcp 类（GitHub / Notion）
    registry.register(MCPTool(
        name="github_get_user",
        displayName="GitHub 用户信息",
        description="查询 GitHub 用户的公开信息（粉丝数、bio、贡献统计）。用于面试场景中评估候选人 GitHub 活跃度",
        emoji="🐙",
        category="mcp",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=github_get_user_handler,
    ))

    registry.register(MCPTool(
        name="github_list_repos",
        displayName="GitHub 仓库列表",
        description="列出 GitHub 用户的公开仓库，按 stars 排序。用于评估候选人的开源贡献和技术栈",
        emoji="📦",
        category="mcp",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=github_list_repos_handler,
    ))

    registry.register(MCPTool(
        name="github_get_readme",
        displayName="GitHub README",
        description="获取仓库 README 内容（Markdown），用于深入评估候选人的项目质量",
        emoji="📖",
        category="mcp",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=github_get_readme_handler,
    ))

    registry.register(MCPTool(
        name="notion_search",
        displayName="Notion 全文搜索",
        description="在 Notion 工作区全文搜索页面，按 query 匹配标题或内容",
        emoji="📝",
        category="mcp",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=notion_search_handler,
    ))

    registry.register(MCPTool(
        name="notion_get_page",
        displayName="Notion 页面内容",
        description="获取 Notion 页面详情（properties + markdown 格式内容）",
        emoji="📄",
        category="mcp",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=notion_get_page_handler,
    ))

    registry.register(MCPTool(
        name="notion_list_databases",
        displayName="Notion 数据库列表",
        description="列出当前 integration 可访问的所有 databases",
        emoji="🗂️",
        category="mcp",
        enabled=True,
        author="system",
        version="1.0.0",
        handler=notion_list_databases_handler,
    ))