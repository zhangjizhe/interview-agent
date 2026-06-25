"""健康检查

对齐 NestJS HealthController：
- /api/health       liveness（基础探活，不依赖外部）
- /api/health/ready readiness（K8s 探活，真连 Redis/Milvus/Postgres）
"""
from fastapi import APIRouter, Request, HTTPException
import structlog

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.get("")
async def health_check():
    """基础健康检查（liveness · 不依赖外部）"""
    return {"status": "ok", "service": "py-api", "version": "0.1.0"}


@router.get("/ready")
async def readiness(request: Request):
    """就绪检查（readiness · K8s 探活 · 真连依赖）

    任一依赖连不上 → 503（K8s 会把流量切走）
    """
    redis_mem = getattr(request.app.state, "redis_mem", None)
    milvus_mem = getattr(request.app.state, "milvus_mem", None)

    checks = {}
    overall_ok = True

    # L1/L2: Redis
    if redis_mem and redis_mem.client:
        try:
            await redis_mem.client.ping()
            checks["redis"] = "ok"
        except Exception as e:
            checks["redis"] = f"fail: {e}"
            overall_ok = False
    else:
        checks["redis"] = "not_initialized"
        overall_ok = False

    # L3: Milvus
    if milvus_mem and milvus_mem.connected:
        checks["milvus"] = "ok"
    else:
        checks["milvus"] = "not_connected"
        overall_ok = False

    if not overall_ok:
        logger.warning("readiness_check_failed", checks=checks)
        raise HTTPException(status_code=503, detail={"status": "not_ready", "checks": checks})

    return {"status": "ready", "checks": checks}