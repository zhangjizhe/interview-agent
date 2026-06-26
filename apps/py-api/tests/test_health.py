"""test_health.py · /api/health + /api/health/ready（P0-3 修复）

覆盖：
- /api/health（liveness）200 OK 不依赖外部
- /api/health/ready 200 OK（依赖真连上）
- /api/health/ready 503（Redis ping 失败）
- /api/health/ready 503（Milvus 未连）
"""
from unittest.mock import AsyncMock


def test_health_liveness_always_ok(client):
    """/api/health（liveness）200 OK，不依赖外部"""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "py-api"


def test_health_ready_returns_200_when_deps_ok(client):
    """/api/health/ready 200 OK（mock redis.ping OK + milvus.connected）"""
    # 用 client.app 而不是 from app.main import app（避免 import 时拿到不同实例）
    app = client.app
    app.state.redis_mem.client = AsyncMock()
    app.state.redis_mem.client.ping = AsyncMock(return_value=True)

    resp = client.get("/api/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["checks"]["redis"] == "ok"
    assert data["checks"]["milvus"] == "ok"


def test_health_ready_returns_503_when_redis_ping_fails(client):
    """/api/health/ready 503（Redis ping 失败）"""
    app = client.app
    app.state.redis_mem.client = AsyncMock()
    app.state.redis_mem.client.ping = AsyncMock(side_effect=ConnectionError("Redis down"))

    resp = client.get("/api/health/ready")
    assert resp.status_code == 503
    data = resp.json()["detail"]
    assert data["status"] == "not_ready"
    assert "Redis down" in data["checks"]["redis"]


def test_health_ready_returns_503_when_milvus_not_connected(client):
    """/api/health/ready 503（Milvus 未连接）"""
    app = client.app
    app.state.redis_mem.client = AsyncMock()
    app.state.redis_mem.client.ping = AsyncMock(return_value=True)
    app.state.milvus_mem.connected = False

    resp = client.get("/api/health/ready")
    assert resp.status_code == 503
    assert resp.json()["detail"]["checks"]["milvus"] == "not_connected"