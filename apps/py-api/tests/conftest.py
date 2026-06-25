"""共享 fixtures · 纯 unit test · 不连外部依赖

测试覆盖：
- health 路由（liveness + readiness + 真连 mock 依赖）
- auth 路由（JWT login）
- interview 路由（/start + /stream + 异常降级）
- redis_memory（L1/L2 真写入，用 fake_redis mock）
- milvus_memory（urlparse 解析 + collection 字段）
- mem0_memory（cloud/oss/disabled 模式 + payload 格式）
- reviewer_router（运算符优先级 bug 修复）
- state（user_id + user_role 注入）
- config（JWT_SECRET fail-fast）
"""
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock

# 确保可 import app.*
sys.path.insert(0, "apps/py-api")


# ===== Fake Redis（unit test 用，不连真实 Redis）=====

class FakeRedis:
    """最小 Redis 假实现，支持 hset/hgetall/lpush/lrange/ltrim/delete/ping"""

    def __init__(self):
        self.hashes: dict = {}
        self.lists: dict = {}

    async def hset(self, key, *args, mapping=None):
        # redis-py 5.x 实际签名兼容：
        # - hset(key, mapping={f1: v1, f2: v2})  ← 多字段，set_working_state 用
        # - hset(key, field, value)              ← 单字段，update_working_field 用
        if mapping is not None and isinstance(mapping, dict):
            self.hashes.setdefault(key, {}).update(mapping)
            return len(mapping)
        if len(args) == 2:
            field, value = args
            self.hashes.setdefault(key, {})[field] = value
            return 1
        raise TypeError(f"hset({key}, ...) needs mapping=dict or (field, value), got args={args}, mapping={mapping}")

    async def hgetall(self, key):
        return self.hashes.get(key, {}) or {}

    async def lpush(self, key, *values):
        self.lists.setdefault(key, [])
        for v in values:
            self.lists[key].insert(0, v)
        return len(self.lists[key])

    async def lrange(self, key, start, end):
        lst = self.lists.get(key, [])
        # Redis LRange 行为：end=-1 表示到最后
        if end == -1:
            return lst[start:]
        return lst[start : end + 1]

    async def ltrim(self, key, start, end):
        lst = self.lists.get(key, [])
        if end == -1:
            self.lists[key] = lst[start:]
        else:
            self.lists[key] = lst[start : end + 1]
        return True

    async def delete(self, *keys):
        n = 0
        for k in keys:
            if k in self.hashes:
                del self.hashes[k]
                n += 1
            if k in self.lists:
                del self.lists[k]
                n += 1
        return n

    async def ping(self):
        return True

    async def close(self):
        pass


@pytest.fixture
def fake_redis():
    return FakeRedis()


@pytest.fixture
def redis_memory(fake_redis, monkeypatch):
    """RedisMemory 但 client 替换为 fake_redis"""
    from app.memory.redis_memory import RedisMemory
    rm = RedisMemory(url="redis://fake:6379")
    rm.client = fake_redis
    return rm


# ===== FastAPI test client =====

@pytest.fixture
def mock_app_state(monkeypatch):
    """mock app.state 上的 graph / redis_mem / milvus_mem / mem0_mem / settings"""

    mock_settings = MagicMock()
    mock_settings.JWT_SECRET = "test-secret-min-32-chars-long-aaaaaa"
    mock_settings.NODE_ENV = "development"

    fake_graph = AsyncMock()
    fake_graph.ainvoke = AsyncMock(return_value={
        "final_response": "Mock final response",
        "review_score": 85.0,
        "review_issues": [],
        "hitl_pending": False,
        "current_specialist": "reviewer",
    })

    async def fake_astream(initial, config=None, stream_mode="values"):
        # values 模式（Py API 当前用）：yield dict state
        yield {"current_specialist": "supervisor", "final_response": None}
        yield {"current_specialist": "executor", "final_response": None}
        yield {"current_specialist": "reviewer", "final_response": "Mock final response"}

    fake_graph.astream = fake_astream

    # redis_mem 用 RedisMemory 实例 + fake_redis（让 L1/L2 真写入能验证）
    from app.memory.redis_memory import RedisMemory
    fake_redis_obj = FakeRedis()
    real_redis_mem = RedisMemory(url="redis://fake:6379")
    real_redis_mem.client = fake_redis_obj

    return {
        "settings": mock_settings,
        "interview_graph": fake_graph,
        "redis_mem": real_redis_mem,
        "milvus_mem": MagicMock(connected=True),
        "mem0_mem": MagicMock(is_enabled=lambda: False),
        "_fake_redis": fake_redis_obj,  # 测试可通过 client.app.state._state 间接拿到
    }


@pytest.fixture
def client(mock_app_state):
    """FastAPI TestClient，app.state 注入 mock

    关键：不使用 with TestClient(app) 作为 context manager，
    避免触发 lifespan（lifespan 会跑真 Redis/Milvus 连接，覆盖 mock）。
    """
    from fastapi.testclient import TestClient
    from app.main import create_app

    app = create_app()
    for k, v in mock_app_state.items():
        setattr(app.state, k, v)

    c = TestClient(app)
    try:
        yield c
    finally:
        pass  # 不进 lifespan shutdown