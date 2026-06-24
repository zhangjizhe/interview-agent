"""
4 层记忆架构 L3 下半：Mem0 云服务 / OSS 自托管

对齐 NestJS Mem0CloudMemory（云 + OSS 双模式）
"""
from typing import List, Optional, Dict, Any
import httpx


class Mem0Memory:
    """Mem0 REST API 客户端（云服务 + OSS 自托管）"""

    CLOUD_BASE = "https://api.mem0.ai"
    OSS_PATHS = {
        "add": "/memories",
        "search": "/search",
        "list": "/memories",
    }
    CLOUD_PATHS = {
        "add": "/v3/memories/add/",
        "search": "/v3/memories/search/",
        "list": "/v3/memories/",
    }

    def __init__(self, api_key: str = "", host: str = ""):
        self.api_key = api_key
        self.host = host
        self.mode = self._detect_mode(api_key, host)
        self.base_url, self.paths, self.headers = self._build_endpoint()

    def _detect_mode(self, api_key: str, host: str) -> str:
        if host:
            return "oss"
        if api_key:
            return "cloud"
        return "disabled"

    def _build_endpoint(self):
        if self.mode == "cloud":
            return self.CLOUD_BASE, self.CLOUD_PATHS, {
                "Content-Type": "application/json",
                "Authorization": f"Token {self.api_key}",
            }
        if self.mode == "oss":
            base = self.host.rstrip("/")
            return base, self.OSS_PATHS, {"Content-Type": "application/json"}
        return "", {}, {}

    def is_enabled(self) -> bool:
        return self.mode in ("cloud", "oss")

    async def memorize(self, user_id: str, messages: List[Dict[str, str]]) -> bool:
        """写入记忆"""
        if not self.is_enabled() or not messages:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}{self.paths['add']}",
                    headers=self.headers,
                    json={
                        "user_id": user_id,
                        "messages": messages,
                    },
                )
                return resp.status_code == 200
        except Exception as e:
            print(f"[Mem0] memorize failed: {e}")
            return False

    async def search(self, user_id: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """语义检索记忆"""
        if not self.is_enabled():
            return []
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}{self.paths['search']}",
                    headers=self.headers,
                    json={
                        "query": query,
                        "filters": {"user_id": user_id},
                        "top_k": limit,
                    },
                )
                if resp.status_code == 200:
                    return resp.json().get("results", [])
                return []
        except Exception as e:
            print(f"[Mem0] search failed: {e}")
            return []