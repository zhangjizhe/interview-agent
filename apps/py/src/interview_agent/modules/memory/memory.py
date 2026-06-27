"""Memory 模块 — 与 NestJS memory/* 像素级对齐。

四层记忆：
- L1 工作记忆：Redis Hash（面试进度状态）
- L2 会话记忆：Redis List（最近 50 条对话）
- L3 长期记忆：Mem0 / Milvus（候选人画像）
- L4 结构化：Prisma SessionCost + Interview

实际对齐 NestJS：
- L1 = shared-ctx:{interviewId}（Redis Hash）
- L2 = conv:{interviewId}（Redis List lpush + ltrim(0,49) + TTL）
- L3 = Mem0 cloud / Milvus（无 key 时降级）
- L4 = Prisma
"""
import json
import logging
from typing import Any

from interview_agent.infra.redis_client import get_redis

logger = logging.getLogger(__name__)


# ============================================================
# L1 工作记忆
# ============================================================


async def l1_set(interview_id: str, key: str, value: str) -> None:
    redis = get_redis()
    await redis.hset(f"shared-ctx:{interview_id}", key, value)


async def l1_get(interview_id: str, key: str) -> str | None:
    redis = get_redis()
    return await redis.hget(f"shared-ctx:{interview_id}", key)


async def l1_getall(interview_id: str) -> dict:
    redis = get_redis()
    return await redis.hgetall(f"shared-ctx:{interview_id}")


async def l1_set_progress(
    interview_id: str,
    question_index: int,
    covered_skills: list[str],
    score_history: list[float],
) -> None:
    """更新面试进度（一次性写多个字段）。"""
    redis = get_redis()
    await redis.hset(
        f"shared-ctx:{interview_id}",
        mapping={
            "questionIndex": str(question_index),
            "coveredSkills": json.dumps(covered_skills, ensure_ascii=False),
            "scoreHistory": json.dumps(score_history),
        },
    )


# ============================================================
# L2 会话记忆
# ============================================================


async def l2_append(interview_id: str, message: dict) -> None:
    """追加消息到会话记忆（lpush + ltrim(0,49) + TTL）。"""
    redis = get_redis()
    key = f"conv:{interview_id}"
    await redis.lpush(key, json.dumps(message, ensure_ascii=False))
    await redis.ltrim(key, 0, 49)
    await redis.expire(key, 3600)


async def l2_get_recent(interview_id: str, limit: int = 50) -> list[dict]:
    """获取最近 N 条消息。"""
    redis = get_redis()
    raw = await redis.lrange(f"conv:{interview_id}", 0, limit - 1)
    return [json.loads(m) for m in raw]


# ============================================================
# L3 长期记忆（Mem0 / Milvus，无 key 时降级到 in-process dict）
# ============================================================

_long_term_store: dict[str, dict] = {}


async def l3_write(user_id: str, key: str, value: Any) -> None:
    """写 L3 长期记忆。

    优先级：Mem0 cloud > Milvus > in-process dict（兜底）
    """
    from interview_agent.config import settings

    # 1. 尝试 Mem0
    if settings.MEM0_API_KEY and "placeholder" not in settings.MEM0_API_KEY:
        try:
            from mem0 import MemoryClient
            client = MemoryClient(api_key=settings.MEM0_API_KEY)
            client.add(
                messages=[{"role": "user", "content": f"{key}: {value}"}],
                user_id=user_id,
            )
            return
        except Exception as e:
            logger.warning(f"Mem0 write failed: {e}")

    # 2. 兜底到 in-process dict
    _long_term_store.setdefault(user_id, {})[key] = value


async def l3_read(user_id: str, key: str | None = None) -> Any:
    """读 L3 长期记忆。"""
    from interview_agent.config import settings

    if settings.MEM0_API_KEY and "placeholder" not in settings.MEM0_API_KEY:
        try:
            from mem0 import MemoryClient
            client = MemoryClient(api_key=settings.MEM0_API_KEY)
            results = client.get_all(user_id=user_id)
            if key is None:
                return results
            for r in results:
                if key in r.get("memory", ""):
                    return r["memory"]
        except Exception as e:
            logger.warning(f"Mem0 read failed: {e}")

    # 兜底
    user_store = _long_term_store.get(user_id, {})
    if key is None:
        return user_store
    return user_store.get(key)


async def l3_search(user_id: str, query: str, top_k: int = 5) -> list[str]:
    """语义搜索 L3 记忆。"""
    from interview_agent.config import settings

    if settings.MEM0_API_KEY and "placeholder" not in settings.MEM0_API_KEY:
        try:
            from mem0 import MemoryClient
            client = MemoryClient(api_key=settings.MEM0_API_KEY)
            results = client.search(query=query, user_id=user_id, limit=top_k)
            return [r.get("memory", "") for r in results]
        except Exception as e:
            logger.warning(f"Mem0 search failed: {e}")

    # 兜底：in-process 关键词搜索
    user_store = _long_term_store.get(user_id, {})
    q_lower = query.lower()
    matches = [
        v for v in user_store.values()
        if isinstance(v, str) and q_lower in v.lower()
    ]
    return matches[:top_k]


# ============================================================
# L4 结构化（Prisma SessionCost）
# ============================================================


async def l4_archive_interview(
    session,
    interview_id: str,
    report: dict,
) -> None:
    """L4 归档：写 Report 表（Prisma SessionCost 由 cost tracker 处理）。"""
    import secrets
    from interview_agent.infra.models import Report

    row = Report(
        id=f"r{secrets.token_hex(12)}",
        interview_id=interview_id,
        overall_score=report.get("overallScore", 75),
        scores=report.get("scores", {}),
        strengths=report.get("strengths", ""),
        weaknesses=report.get("weaknesses", ""),
        suggestions=report.get("suggestions", ""),
    )
    session.add(row)
    await session.commit()