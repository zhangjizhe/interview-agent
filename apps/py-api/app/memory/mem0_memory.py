"""
4 层记忆架构 L3 下半：Mem0 云服务 / OSS 自托管

对齐 NestJS Mem0CloudMemory（云 + OSS 双模式）

P0-1 修复：
- 错误时 raise 而非 silent return（让上游知道失败，可观测）
- 加 structlog 上报 error
- 兜底用空字符串（cloud 强依赖 OSS 字段）
"""
from typing import List, Optional, Dict, Any
import httpx
import structlog

logger = structlog.get_logger(__name__)


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
        """写入记忆

        P0-1 修复：错误时 raise 而非 silent return，让上游能感知失败。
        返回 bool 仅表示"是否成功 200"。
        """
        if not self.is_enabled() or not messages:
            return False

        # Mem0 v3 API 格式（cloud）+ v1 API 格式（oss）payload
        if self.mode == "cloud":
            # cloud v3: {"user_id":..., "messages":[{"role":..., "content":...}, ...]}
            payload = {"user_id": user_id, "messages": messages}
        else:
            # oss v1: {"user_id":..., "messages":...} （messages 直接是 list）
            payload = {"user_id": user_id, "messages": messages}

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}{self.paths['add']}",
                    headers=self.headers,
                    json=payload,
                )
                if resp.status_code == 200:
                    logger.info("mem0_memorize_ok", user_id=user_id, count=len(messages))
                    return True

                # P0-1 修复：失败时 raise（不再 silent return）
                error_text = resp.text[:500]
                logger.error(
                    "mem0_memorize_failed",
                    user_id=user_id,
                    status_code=resp.status_code,
                    error=error_text,
                    mode=self.mode,
                )
                raise Mem0APIError(
                    f"Mem0 memorize failed: HTTP {resp.status_code} mode={self.mode} body={error_text}"
                )
        except httpx.HTTPError as e:
            logger.error("mem0_memorize_http_error", user_id=user_id, error=str(e))
            raise Mem0APIError(f"Mem0 memorize network error: {e}") from e

    async def search(self, user_id: str, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """语义检索记忆

        P0-1 修复：错误时 raise 而非 silent return，让上游能感知失败。
        """
        if not self.is_enabled():
            return []

        payload = {
            "query": query,
            "filters": {"user_id": user_id},
            "top_k": limit,
        }

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}{self.paths['search']}",
                    headers=self.headers,
                    json=payload,
                )
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    logger.info("mem0_search_ok", user_id=user_id, hits=len(results))
                    return results

                # P0-1 修复：失败时 raise
                error_text = resp.text[:500]
                logger.error(
                    "mem0_search_failed",
                    user_id=user_id,
                    status_code=resp.status_code,
                    error=error_text,
                    mode=self.mode,
                )
                raise Mem0APIError(
                    f"Mem0 search failed: HTTP {resp.status_code} mode={self.mode} body={error_text}"
                )
        except httpx.HTTPError as e:
            logger.error("mem0_search_http_error", user_id=user_id, error=str(e))
            raise Mem0APIError(f"Mem0 search network error: {e}") from e


class Mem0APIError(Exception):
    """Mem0 API 调用失败（HTTP 4xx/5xx 或网络错误）"""
    pass