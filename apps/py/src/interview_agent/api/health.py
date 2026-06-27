"""Health endpoints — 与 NestJS HealthController 像素级等价。

对齐 NestJS HealthController（apps/api/src/common/health.controller.ts）：
- GET /health — liveness：服务在跑 → 200
- GET /health/ready — readiness：真连 Postgres + Redis，依赖 OK 才返回 200
"""
import time
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from interview_agent.infra.redis_client import get_redis

router = APIRouter(tags=["health"])

_start_time = time.time()


@router.get("/health")
async def liveness() -> dict:
    """liveness — Docker HEALTHCHECK 用。

    与 NestJS HealthController.liveness() 字段一致：
    ```json
    { "status": "ok", "timestamp": "2026-06-27T14:00:00.000Z" }
    ```
    """
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/ready")
async def readiness() -> dict:
    """readiness — K8s readinessProbe / 负载均衡探测。

    真连 Postgres + Redis，任一依赖 fail → 503（让 K8s 切流量）。
    与 NestJS HealthController.readiness() 字段一致：
    ```json
    { "status": "ready", "checks": { "postgres": "ok", "redis": "ok" }, "timestamp": "..." }
    ```
    """
    from interview_agent.infra.db import async_session_factory

    checks: dict[str, str] = {}
    ok = True

    # Postgres
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as e:  # noqa: BLE001
        checks["postgres"] = f"fail: {e}"
        ok = False

    # Redis
    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception as e:  # noqa: BLE001
        checks["redis"] = f"fail: {e}"
        ok = False

    payload = {
        "status": "ready" if ok else "not_ready",
        "checks": checks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return payload