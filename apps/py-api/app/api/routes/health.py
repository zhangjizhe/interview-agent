"""健康检查"""
from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def health_check():
    """基础健康检查"""
    return {"status": "ok", "service": "py-api", "version": "0.1.0"}


@router.get("/ready")
async def readiness():
    """就绪检查（依赖 Redis/Milvus）"""
    return {"status": "ready"}