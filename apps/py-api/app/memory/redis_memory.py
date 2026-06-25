"""
4 层记忆架构 L1/L2：Redis Hash 工作记忆 + Redis List 会话

对齐 NestJS RedisService.hgetall/hmset/hget/hdel
"""
import redis.asyncio as redis
import json
from typing import Optional, Dict, List


class RedisMemory:
    """Redis 异步客户端，封装工作记忆 + 会话记忆"""

    def __init__(self, url: str):
        self.url = url
        self.client: Optional[redis.Redis] = None

    async def connect(self):
        """建立连接（lifespan 钩子调用）"""
        # redis-py 5.x 兼容：max_retries_per_request 改为 retry_on_timeout
        self.client = redis.from_url(
            self.url,
            decode_responses=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )

    async def close(self):
        if self.client:
            await self.client.close()

    # ===== L1 工作记忆 (Redis Hash) =====

    async def set_working_state(self, session_id: str, data: Dict[str, str]) -> None:
        """L1: 工作记忆（Hash）"""
        if not self.client:
            return
        await self.client.hset(f"interview:{session_id}:working", mapping=data)

    async def get_working_state(self, session_id: str) -> Dict[str, str]:
        """L1: 读取工作记忆"""
        if not self.client:
            return {}
        return await self.client.hgetall(f"interview:{session_id}:working") or {}

    async def update_working_field(self, session_id: str, field: str, value: str) -> None:
        """L1: 更新单个工作记忆字段"""
        if not self.client:
            return
        await self.client.hset(f"interview:{session_id}:working", field, value)

    async def clear_working_state(self, session_id: str) -> None:
        """L1: 清除工作记忆"""
        if not self.client:
            return
        await self.client.delete(f"interview:{session_id}:working")

    # ===== L2 会话记忆 (Redis List) =====

    async def append_message(self, session_id: str, msg: dict, max_len: int = 50) -> None:
        """L2: 追加消息 + LTRIM 保持最近 max_len 条

        2026-06-26 P1-6 修复：保留 lpush 语义（最新在前），但新增 get_messages_chronological()
        返回追加顺序（最老在前），与 LLM prompt 拼接更直觉。
        """
        if not self.client:
            return
        key = f"interview:{session_id}:messages"
        await self.client.lpush(key, json.dumps(msg, ensure_ascii=False))
        await self.client.ltrim(key, 0, max_len - 1)

    async def get_recent_messages(self, session_id: str, limit: int = 20) -> List[dict]:
        """L2: 读取最近 N 条消息（最新在前，对齐 NestJS RedisService getRecentMessages）

        保持原 lpush 语义的读取：返回最新在前（index 0 是最新消息）。
        下游 LLM prompt 拼接用 get_messages_chronological() 更直觉。
        """
        if not self.client:
            return []
        key = f"interview:{session_id}:messages"
        raw = await self.client.lrange(key, 0, limit - 1)
        return [json.loads(m) for m in raw]

    async def get_messages_chronological(self, session_id: str, limit: int = 20) -> List[dict]:
        """L2: 读取最近 N 条消息（追加顺序：最老在前）

        2026-06-26 P1-6 新增：把最新在前反转为最老在前，
        LLM prompt 拼接（如 ChatML / messages 数组）直接用这个。
        """
        recent = await self.get_recent_messages(session_id, limit)
        return list(reversed(recent))

    async def clear_session(self, session_id: str) -> None:
        """L2: 清除整个会话"""
        if not self.client:
            return
        await self.client.delete(f"interview:{session_id}:messages")