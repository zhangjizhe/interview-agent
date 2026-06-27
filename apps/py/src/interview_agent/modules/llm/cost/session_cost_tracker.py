"""SessionCostTracker — 与 NestJS SessionCostTracker 像素级对齐。

存储：Prisma SessionCost + Redis 实时 counter
- Redis HINCRBY pipeline（实时读，< 100ms）
- 每 5 次刷一次 DB（防抖）
- GET /api/session/:id/cost 先 flush 再读
"""
import json
import logging
import os
from typing import Any

from sqlalchemy import select

from interview_agent.infra.db import async_session_factory
from interview_agent.infra.models import SessionCost
from interview_agent.infra.redis_client import get_redis

logger = logging.getLogger(__name__)

REDIS_KEY_PREFIX = "session_cost:"
REDIS_FLUSH_EVERY = 5


class SessionCostTracker:
    """会话级成本面板单例。"""

    _instance: "SessionCostTracker | None" = None
    _buffer: dict[str, int] = {}

    def __init__(self):
        pass

    @classmethod
    def instance(cls) -> "SessionCostTracker":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @staticmethod
    def _redis_key(interview_id: str) -> str:
        return f"{REDIS_KEY_PREFIX}{interview_id}"

    async def start_session(self, interview_id: str) -> None:
        """启动 session：幂等创建 SessionCost + 清 Redis counter。"""
        async with async_session_factory() as session:
            existing = await session.get(SessionCost, interview_id) if False else None
            # 实际上 SessionCost 用 interviewId 唯一，所以 upsert：
            stmt = select(SessionCost).where(SessionCost.interview_id == interview_id)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if row is None:
                import secrets
                session.add(SessionCost(
                    id=f"c{secrets.token_hex(12)}",
                    interview_id=interview_id,
                ))
                await session.commit()
        redis = get_redis()
        await redis.delete(self._redis_key(interview_id))

    async def record_llm_call(self, metric: dict[str, Any]) -> None:
        """每次 LLM 调用埋点。"""
        interview_id = metric.get("interviewId", "")
        # 防御性：invalid interviewId skip
        if not interview_id or interview_id in ("unknown", "anonymous"):
            logger.warning(
                f"[recordLlmCall] skip invalid interviewId={interview_id} (cost tracking only)"
            )
            return

        key = self._redis_key(interview_id)
        redis = get_redis()

        # Redis HINCRBY pipeline
        pipe = redis.pipeline()
        pipe.hincrby(key, "llmCalls", 1)
        pipe.hincrby(key, "totalPromptTokens", metric.get("promptTokens", 0))
        pipe.hincrby(key, "totalCompletionTokens", metric.get("completionTokens", 0))
        pipe.hincrby(key, "totalTokens",
                     metric.get("promptTokens", 0) + metric.get("completionTokens", 0))
        if metric.get("cachedTokens", 0) > 0:
            pipe.hincrby(key, "promptCacheHits", 1)
            pipe.hincrby(key, "cachedTokens", metric["cachedTokens"])
            pipe.hincrby(key, "cacheSavedTokens", metric["cachedTokens"])
        elif not metric.get("cacheHit", False):
            if metric.get("provider") in ("qwen", "deepseek"):
                pipe.hincrby(key, "promptCacheMisses", 1)
        if metric.get("cacheHit", False):
            pipe.hincrby(key, "semanticCacheHits", 1)
        if metric.get("isRetry", False):
            pipe.hincrby(key, "retries", 1)
        if metric.get("isFallback", False):
            pipe.hincrby(key, "fallbacks", 1)
        if metric.get("isError", False):
            pipe.hincrby(key, "errors", 1)
        await pipe.execute()

        # Buffer 累加，每 5 次刷盘
        buf = self._buffer.get(interview_id, 0) + 1
        self._buffer[interview_id] = buf
        if buf >= REDIS_FLUSH_EVERY:
            await self.flush_to_db(interview_id)
            self._buffer[interview_id] = 0

    async def end_session(self, interview_id: str) -> None:
        """结束 session：flush + 写 endedAt。"""
        await self.flush_to_db(interview_id)
        async with async_session_factory() as session:
            row = await session.get(SessionCost, interview_id)
            if row:
                from datetime import datetime, timezone
                row.ended_at = datetime.now(timezone.utc)
                await session.commit()

    async def flush_to_db(self, interview_id: str) -> None:
        """强制 flush：把 Redis counter 刷到 SessionCost 表。"""
        if not interview_id or interview_id in ("unknown", "anonymous"):
            logger.warning(f"[FLUSH] skip invalid interviewId={interview_id}")
            return

        key = self._redis_key(interview_id)
        redis = get_redis()
        raw = await redis.hgetall(key)
        if not raw:
            return

        # 计算 cost（按 provider 单价）
        input_price = float(os.getenv("QWEN_INPUT_PRICE", "0.004"))
        output_price = float(os.getenv("QWEN_OUTPUT_PRICE", "0.012"))
        cache_discount = 0.4

        total_prompt = int(raw.get("totalPromptTokens", 0) or 0)
        total_completion = int(raw.get("totalCompletionTokens", 0) or 0)
        cached_tokens = int(raw.get("cachedTokens", 0) or 0)
        uncached_prompt = total_prompt - cached_tokens
        cost = (
            (uncached_prompt / 1000) * input_price
            + (cached_tokens / 1000) * input_price * cache_discount
            + (total_completion / 1000) * output_price
        )

        async with async_session_factory() as session:
            # upsert by interview_id
            stmt = select(SessionCost).where(SessionCost.interview_id == interview_id)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            data = {
                "llm_calls": int(raw.get("llmCalls", 0) or 0),
                "total_prompt_tokens": total_prompt,
                "total_completion_tokens": total_completion,
                "total_tokens": total_prompt + total_completion,
                "prompt_cache_hits": int(raw.get("promptCacheHits", 0) or 0),
                "prompt_cache_misses": int(raw.get("promptCacheMisses", 0) or 0),
                "cached_tokens": cached_tokens,
                "semantic_cache_hits": int(raw.get("semanticCacheHits", 0) or 0),
                "semantic_cache_misses": int(raw.get("semanticCacheMisses", 0) or 0),
                "cache_saved_tokens": int(raw.get("cacheSavedTokens", 0) or 0),
                "retries": int(raw.get("retries", 0) or 0),
                "fallbacks": int(raw.get("fallbacks", 0) or 0),
                "errors": int(raw.get("errors", 0) or 0),
                "input_cost_per_1k": input_price,
                "output_cost_per_1k": output_price,
                "cache_discount": cache_discount,
                "estimated_cost_cny": cost,
            }
            if row:
                for k, v in data.items():
                    setattr(row, k, v)
            else:
                import secrets
                row = SessionCost(
                    id=f"c{secrets.token_hex(12)}",
                    interview_id=interview_id,
                    **data,
                )
                session.add(row)
            await session.commit()
        logger.warning(f"[FLUSH] OK interviewId={interview_id}")

    async def get_cost_panel(self, interview_id: str) -> dict:
        """GET /api/session/:id/cost 用的快路径。"""
        await self.flush_to_db(interview_id)
        async with async_session_factory() as session:
            stmt = select(SessionCost).where(SessionCost.interview_id == interview_id)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if not row:
                return {
                    "sessionId": interview_id,
                    "totalTokens": 0, "llmCalls": 0,
                    "promptCacheHits": 0, "promptCacheMisses": 0, "promptCacheHitRate": 0,
                    "semanticCacheHits": 0, "semanticCacheMisses": 0, "semanticCacheHitRate": 0,
                    "cacheSavedTokens": 0,
                    "retryRate": 0, "fallbackRate": 0,
                    "estimatedCostCny": 0, "durationMs": 0,
                }
            prompt_total = (row.prompt_cache_hits or 0) + (row.prompt_cache_misses or 0)
            semantic_total = (row.semantic_cache_hits or 0) + (row.semantic_cache_misses or 0)
            from datetime import datetime
            now_naive = datetime.utcnow()
            duration_ms = (
                int((row.ended_at - row.started_at).total_seconds() * 1000)
                if row.ended_at
                else int((now_naive - row.started_at).total_seconds() * 1000)
            )
            return {
                "sessionId": interview_id,
                "totalTokens": row.total_tokens or 0,
                "llmCalls": row.llm_calls or 0,
                "promptCacheHits": row.prompt_cache_hits or 0,
                "promptCacheMisses": row.prompt_cache_misses or 0,
                "promptCacheHitRate": round(row.prompt_cache_hits / prompt_total, 4) if prompt_total else 0,
                "semanticCacheHits": row.semantic_cache_hits or 0,
                "semanticCacheMisses": row.semantic_cache_misses or 0,
                "semanticCacheHitRate": round(row.semantic_cache_hits / semantic_total, 4) if semantic_total else 0,
                "cacheSavedTokens": row.cache_saved_tokens or 0,
                "retryRate": round((row.retries or 0) / row.llm_calls, 4) if row.llm_calls else 0,
                "fallbackRate": round((row.fallbacks or 0) / row.llm_calls, 4) if row.llm_calls else 0,
                "errors": row.errors or 0,
                "estimatedCostCny": round(row.estimated_cost_cny or 0, 4),
                "durationMs": duration_ms,
            }


def get_cost_tracker() -> SessionCostTracker:
    return SessionCostTracker.instance()


async def session_cost_controller(interview_id: str) -> dict:
    """与 NestJS session-cost.controller 等价的 FastAPI handler。"""
    return await get_cost_tracker().get_cost_panel(interview_id)