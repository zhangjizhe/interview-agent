"""Redis 客户端 — 与 NestJS RedisService 像素级对齐。

API 1:1：
- get / set(key, value, ttlSeconds?) / del
- lpush / lrange / ltrim / expire
- hgetall / hget / hmset / hdel

行为对齐：
- lazy connect（fail-fast）
- TTL 用 EX 单位（秒）
- 连接池配置
"""
from typing import Annotated

from fastapi import Depends
from redis.asyncio import ConnectionPool, Redis
from redis.exceptions import ConnectionError as RedisConnectionError

from interview_agent.config import settings

# 全局 pool（lifespan 启动时 ping，关闭时 close）
_pool: ConnectionPool | None = None
_client: Redis | None = None


async def init_redis() -> None:
    """对齐 RedisService.onModuleInit：fail-fast 连接 + 日志。

    上层（docker-compose / k8s）通过 health check + restart 策略恢复。
    """
    global _pool, _client
    _pool = ConnectionPool.from_url(
        settings.REDIS_URL,
        max_connections=20,
        decode_responses=True,
    )
    _client = Redis(connection_pool=_pool)
    # fail-fast：连接失败时立即抛错（不让 NestJS/Python 启动后再雪崩）
    await _client.ping()


async def close_redis() -> None:
    """对齐 RedisService.onModuleDestroy。"""
    global _pool, _client
    if _client:
        await _client.aclose()
    if _pool:
        await _pool.aclose()
    _client = None
    _pool = None


def get_redis() -> Redis:
    """FastAPI Depends：获取 Redis client。

    业务用法：
    ```python
    @router.get("/items")
    async def list_items(redis: RedisDep):
        await redis.set("key", "value", ex=60)
        return await redis.get("key")
    ```
    """
    if _client is None:
        raise RuntimeError("Redis not initialized — call init_redis() in lifespan first")
    return _client


RedisDep = Annotated[Redis, Depends(get_redis)]


# ============================================================
# 1:1 API 包装（与 RedisService 方法签名一致，方便后续 Phase 替换）
# ============================================================


async def redis_get(key: str) -> str | None:
    return await get_redis().get(key)


async def redis_set(key: str, value: str, ttl_seconds: int | None = None) -> None:
    if ttl_seconds:
        await get_redis().set(key, value, ex=ttl_seconds)
    else:
        await get_redis().set(key, value)


async def redis_del(key: str) -> None:
    await get_redis().delete(key)


async def redis_lpush(key: str, value: str) -> int:
    return await get_redis().lpush(key, value)


async def redis_lrange(key: str, start: int, stop: int) -> list[str]:
    return await get_redis().lrange(key, start, stop)


async def redis_ltrim(key: str, start: int, stop: int) -> None:
    await get_redis().ltrim(key, start, stop)


async def redis_expire(key: str, seconds: int) -> None:
    await get_redis().expire(key, seconds)


async def redis_hgetall(key: str) -> dict[str, str]:
    return await get_redis().hgetall(key)


async def redis_hget(key: str, field: str) -> str | None:
    return await get_redis().hget(key, field)


async def redis_hmset(key: str, data: dict[str, str]) -> None:
    await get_redis().hset(key, mapping=data)


async def redis_hdel(key: str, *fields: str) -> None:
    await get_redis().hdel(key, *fields)