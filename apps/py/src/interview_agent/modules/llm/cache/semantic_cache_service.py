"""Semantic Cache — 与 NestJS SemanticCacheService 像素级对齐。

行为：
- 黑名单（scoring / tool_result / resume_parse / report_generate）强制 miss
- 白名单（interview_question / general_qa）启用
- Fast path：Redis hash 精确桶（< 5ms）
- Slow path：Qwen text-embedding-v3 + Qdrant cosine（阈值 0.92）
- setImmediate-style 异步写入（不阻塞主调用）

降级策略：
- 无 QWEN_API_KEY / Qdrant 不可用时，全部走 Redis 精确层
"""
import asyncio
import json
import logging
import os
from typing import Literal

from interview_agent.infra.redis_client import get_redis
from interview_agent.modules.llm.cache.prompt_cache_strategy import fnv1a

logger = logging.getLogger(__name__)

COLLECTION = "semantic_cache"
VECTOR_SIZE = 1024
REDIS_HASH_PREFIX = "sc:hash:"
REDIS_TTL_SECONDS = 3600

SemanticCacheType = Literal[
    "interview_question",
    "general_qa",
    "scoring",
    "tool_result",
    "resume_parse",
    "report_generate",
]

BLACKLIST = {"scoring", "tool_result", "resume_parse", "report_generate"}
WHITELIST = {"interview_question", "general_qa"}


class SemanticCacheService:
    """语义缓存服务单例。

    用法：
    ```python
    svc = SemanticCacheService.instance()
    r = await svc.lookup(user_id, "interview_question", "什么是 React Fiber?")
    if r.hit:
        return r.cached_response
    # ... 调 LLM ...
    svc.set_async(user_id, "interview_question", query, response)
    ```
    """

    _instance: "SemanticCacheService | None" = None
    _qdrant = None  # lazy init
    _embedder = None  # lazy init

    def __init__(self):
        self.enabled = True
        self._qdrant_failed = False

    @classmethod
    def instance(cls) -> "SemanticCacheService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _fast_key(self, user_id: str, cache_type: str, query: str) -> str:
        h = format(fnv1a(f"{user_id}::{cache_type}::{query.strip().lower()}"), "x")
        return f"{REDIS_HASH_PREFIX}{cache_type}:{user_id}:{h}"

    async def lookup(
        self,
        user_id: str,
        cache_type: SemanticCacheType,
        query: str,
        threshold: float = 0.92,
    ) -> dict:
        """查缓存：返回 {hit, cachedResponse, similarity, cacheId} 或 {hit:false, reason}。"""
        if not self.enabled:
            return {"hit": False, "reason": "disabled"}
        if cache_type in BLACKLIST:
            return {"hit": False, "reason": "whitelist"}
        if cache_type not in WHITELIST:
            return {"hit": False, "reason": "whitelist"}

        # Fast path：Redis 精确
        try:
            redis = get_redis()
            exact = await redis.get(self._fast_key(user_id, cache_type, query))
            if exact:
                data = json.loads(exact)
                return {
                    "hit": True,
                    "cachedResponse": data["response"],
                    "similarity": 1.0,
                    "cacheId": data["cacheId"],
                }
        except Exception as e:
            logger.warning(f"semantic-cache fast path error: {e}")

        # Slow path：embedding + Qdrant
        try:
            vector = await self._embed(query)
            results = await self._qdrant_search(vector, user_id, cache_type, threshold)
            if results:
                top = results[0]
                return {
                    "hit": True,
                    "cachedResponse": top["payload"]["response"],
                    "similarity": top["score"],
                    "cacheId": top["id"],
                }
            return {"hit": False, "reason": "low_similarity"}
        except Exception as e:
            logger.warning(f"semantic-cache slow path error: {e}")
            return {"hit": False, "reason": "cold"}

    def set_async(
        self,
        user_id: str,
        cache_type: SemanticCacheType,
        query: str,
        response: str,
        metadata: dict | None = None,
    ) -> None:
        """异步写缓存（不阻塞主流程）。"""
        if not self.enabled or cache_type in BLACKLIST or cache_type not in WHITELIST:
            return
        # fire-and-forget
        asyncio.create_task(self._set_internal(user_id, cache_type, query, response, metadata))

    async def _set_internal(
        self, user_id, cache_type, query, response, metadata
    ) -> None:
        try:
            vector = await self._embed(query)
            cache_id = str(hash((user_id, query, response)) & 0x7FFFFFFFFFFFFFFF)
            await self._qdrant_upsert(cache_id, vector, {
                "userId": user_id,
                "cacheType": cache_type,
                "query": query,
                "response": response,
                "createdAt": 0,  # server 端时间
                **(metadata or {}),
            })
            redis = get_redis()
            await redis.set(
                self._fast_key(user_id, cache_type, query),
                json.dumps({"response": response, "cacheId": cache_id}),
                ex=REDIS_TTL_SECONDS,
            )
        except Exception as e:
            logger.debug(f"semantic-cache set silent fail: {e}")

    async def _embed(self, text: str) -> list[float]:
        """Qwen text-embedding-v3 → 1024 维向量。

        无 QWEN_API_KEY / OpenAI 包未装时返回 None（让 slow path 跳过）。
        """
        from interview_agent.config import settings

        if not settings.QWEN_API_KEY or "placeholder" in settings.QWEN_API_KEY:
            raise RuntimeError("embedding disabled: QWEN_API_KEY not set")
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise RuntimeError("openai package not installed")
        if self._embedder is None:
            self._embedder = AsyncOpenAI(
                api_key=settings.QWEN_API_KEY, base_url=settings.QWEN_BASE_URL
            )
        resp = await self._embedder.embeddings.create(
            model="text-embedding-v3",
            input=text[:2048],
            encoding_format="float",
            dimensions=VECTOR_SIZE,
        )
        return resp.data[0].embedding

    async def _qdrant_search(self, vector, user_id, cache_type, threshold) -> list[dict]:
        """Qdrant cosine search。无 qdrant-client 时直接返回 []（Redis 精确层兜底）。"""
        try:
            from qdrant_client import AsyncQdrantClient
            from interview_agent.config import settings
            if self._qdrant is None and not self._qdrant_failed:
                self._qdrant = AsyncQdrantClient(url=settings.QDRANT_URL)
            if self._qdrant is None:
                return []
            return await self._qdrant.search(
                collection_name=COLLECTION,
                query_vector=vector,
                limit=1,
                score_threshold=threshold,
                query_filter={
                    "must": [
                        {"key": "userId", "match": {"value": user_id}},
                        {"key": "cacheType", "match": {"value": cache_type}},
                    ]
                },
                with_payload=True,
            )
        except Exception as e:
            logger.debug(f"qdrant search skipped: {e}")
            self._qdrant_failed = True
            return []

    async def _qdrant_upsert(self, point_id, vector, payload) -> None:
        try:
            if self._qdrant is None:
                return
            await self._qdrant.upsert(
                collection_name=COLLECTION,
                points=[{"id": point_id, "vector": vector, "payload": payload}],
            )
        except Exception as e:
            logger.debug(f"qdrant upsert skipped: {e}")


def get_semantic_cache() -> SemanticCacheService:
    return SemanticCacheService.instance()