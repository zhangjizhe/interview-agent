"""Rate Limiting · 2026-06-26 商用 best practice

基于 slowapi 库（基于 limits）：
- 限流维度：客户端 IP（X-Forwarded-For → X-Real-IP → request.client.host）
- 限流粒度：endpoint 级别
- 默认策略：
  - /api/auth/login：5 次/分钟（防爆破）
  - /api/interview/start：10 次/分钟
  - /api/interview/stream：5 次/分钟（SSE 长连接）
  - 其他 GET endpoint：60 次/分钟
- 超限响应：429 Too Many Requests + Retry-After header

参考：
- https://slowapi.readthedocs.io/
- https://limits.readthedocs.io/

商用 checklist：
- 反向代理层（nginx/caddy）也应有 limit_req 模块，作为第一道防线
- slowapi 是应用层第二道防线
"""
from fastapi import Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse
import structlog

logger = structlog.get_logger(__name__)


def get_client_ip(request: Request) -> str:
    """从 X-Forwarded-For / X-Real-IP / 直接连接取 IP

    生产应该部署在反代后面（nginx），反代注入 X-Forwarded-For
    """
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        # 取第一个 IP（最原始的客户端）
        return xff.split(",")[0].strip()
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip.strip()
    if request.client:
        return request.client.host
    return "unknown"


# 全局限流器
limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["60/minute"],  # 默认每个 endpoint 60/min
    storage_uri="memory://",  # 单实例内存（多实例需 redis）
    strategy="fixed-window",  # 固定窗口（vs sliding-window）
    headers_enabled=True,  # response header 加 X-RateLimit-Remaining
)


# 各 endpoint 限流策略（按用户原话"防刷接口"）
AUTH_LIMIT = "5/minute"  # /api/auth/login 防爆破
INTERVIEW_START_LIMIT = "10/minute"  # /api/interview/start 防并发滥用
INTERVIEW_STREAM_LIMIT = "5/minute"  # /api/interview/stream SSE 长连接防占用
HEALTH_LIMIT = "120/minute"  # /api/health 高频探活（K8s 探针）


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """限流超限 handler

    限流超限时：
    - structlog 记录（按 IP + endpoint 维度）
    - 返回 429 + Retry-After header
    """
    client_ip = get_client_ip(request)
    logger.warning(
        "rate_limit_exceeded",
        client_ip=client_ip,
        path=request.url.path,
        method=request.method,
        limit=str(exc.detail),
    )
    return JSONResponse(
        status_code=429,
        content={
            "error": "RATE_LIMIT_EXCEEDED",
            "message": f"请求过于频繁，请稍后重试（limit: {exc.detail}）",
            "details": {"limit": str(exc.detail)},
            "request_id": getattr(request.state, "request_id", None),
        },
        headers={"Retry-After": "60"},  # 60s 后重试
    )