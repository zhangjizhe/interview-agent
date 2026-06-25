"""请求追踪 middleware · 2026-06-26 商用 best practice

每次 HTTP 请求：
1. 从 header X-Request-ID 取（或生成 UUIDv4）
2. 注入 structlog context（所有日志自动带 trace_id）
3. response header 返回 X-Request-ID（客户端可追踪）

对齐 NestJS RequestIdMiddleware（apps/api/src/shared/middleware/request-id.middleware.ts）。
"""
import uuid
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import structlog

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    """每个请求分配 trace_id + 注入 structlog context"""

    async def dispatch(self, request: Request, call_next) -> Response:
        # 1. 复用客户端 X-Request-ID（如果有），否则生成
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())

        # 2. structlog contextvars：所有 structlog.get_logger() 调用自动带 request_id
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
        )

        # 3. 记录开始时间
        start = time.perf_counter()

        # 4. 注入到 request.state（路由函数可读）
        request.state.request_id = request_id

        # 5. 处理请求
        try:
            response = await call_next(request)
        except Exception as e:
            duration_ms = (time.perf_counter() - start) * 1000
            structlog.get_logger("request").error(
                "request_failed",
                error=str(e),
                error_type=type(e).__name__,
                duration_ms=round(duration_ms, 2),
            )
            raise
        else:
            duration_ms = (time.perf_counter() - start) * 1000
            structlog.get_logger("request").info(
                "request_completed",
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
            )
            # 6. response header 加 X-Request-ID
            response.headers[REQUEST_ID_HEADER] = request_id
            return response