"""
py-api: FastAPI 版面试 Agent 后端（与 NestJS 版并行）

架构对齐 apps/api/src/agents/multi-agent/:
- 5 节点多 Agent（supervisor / planner / executor / replanner / reviewer）
- 4 层记忆（Redis 工作记忆 + Redis 会话 + Milvus/Mem0 长期 + Prisma 画像）
- LangGraph v0.5 StateGraph
- FastAPI 0.115 + uvicorn

2026-06-26 商用 best practice 加：
- RequestIDMiddleware（每个请求 trace_id）
- AppErrorHandler（自定义异常 → 4xx/5xx 统一格式）
- CORS 白名单（生产安全）

启动：
    uvicorn app.main:app --reload --port 3002

或 docker-compose：
    docker compose up py-api
"""
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.config import settings
from app.api.routes import interview, interview_more, auth, health, metrics as metrics_route
from app.agents.graph import build_interview_graph
from app.memory.redis_memory import RedisMemory
from app.memory.milvus_memory import MilvusMemory
from app.memory.mem0_memory import Mem0Memory
from app.db.session import init_db, close_db
from app.core.middleware import RequestIDMiddleware
from app.core.exceptions import AppError
from app.core.rate_limit import (
    limiter,
    rate_limit_exceeded_handler,
    HEALTH_LIMIT,
    AUTH_LIMIT,
)
from app.core.metrics import prometheus_middleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动 / 关闭钩子：初始化 4 层记忆 + 编译 LangGraph + L4 PostgreSQL"""
    # L1/L2: Redis 工作记忆 + 会话
    redis_mem = RedisMemory(url=settings.REDIS_URL)
    await redis_mem.connect()

    # L3: Milvus + Mem0 长期记忆
    milvus_mem = MilvusMemory(url=settings.MILVUS_URL)
    await milvus_mem.connect()

    mem0_mem = Mem0Memory(
        api_key=settings.MEM0_API_KEY,
        host=settings.MEM0_HOST,
    )

    # L4: PostgreSQL 长期持久化（P1-9 修复，对齐 NestJS Prisma）
    init_db(settings.DATABASE_URL)

    # 编译 5 节点 LangGraph
    graph = await build_interview_graph(
        redis_mem=redis_mem,
        milvus_mem=milvus_mem,
        mem0_mem=mem0_mem,
        settings=settings,
    )

    app.state.settings = settings
    app.state.redis_mem = redis_mem
    app.state.milvus_mem = milvus_mem
    app.state.mem0_mem = mem0_mem
    app.state.interview_graph = graph

    logger.info(
        "py_api_started",
        version="0.1.0",
        port=settings.PORT,
        node_env=settings.NODE_ENV,
    )

    yield

    logger.info("py_api_shutting_down")
    await redis_mem.close()
    await milvus_mem.close()
    close_db()


def create_app() -> FastAPI:
    app = FastAPI(
        title="interview-agent-2 Python API",
        version="0.1.0",
        description="FastAPI 版多 Agent 面试后端，对齐 NestJS 版 (apps/api/)",
        lifespan=lifespan,
    )

    # Middleware 顺序：后注册的先执行（最外层）
    # 1. CORS（最外层，处理 OPTIONS preflight）
    # 2. SlowAPI（Rate Limiting 集成）
    # 3. Prometheus（采集 request_total / request_duration）
    # 4. RequestIDMiddleware（每个请求分配 trace_id，最内层）
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",  # web dev
            "http://localhost:3001",  # nest api（兼容）
            "http://localhost:3002",  # py-api 自己
        ],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],  # 客户端可读
    )

    # Rate Limiting state
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    # Prometheus HTTP 指标收集中间件
    app.middleware("http")(prometheus_middleware)

    # RequestIDMiddleware 最后加（最内层，所有请求都过）
    app.add_middleware(RequestIDMiddleware)

    # 异常处理：AppError → 4xx/5xx JSON
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        logger.warning(
            "app_error",
            error_code=exc.code,
            error_message=exc.message,
            status_code=exc.status_code,
            details=exc.details,
            request_id=request_id,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.code,
                "message": exc.message,
                "details": exc.details,
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id} if request_id else {},
        )

    # 限流超限 → 429 JSON
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    # 路由
    app.include_router(health.router, prefix="/api/health", tags=["health"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(interview.router, prefix="/api/interview", tags=["interview"])
    app.include_router(interview_more.router, prefix="/api/interview", tags=["interview"])
    app.include_router(metrics_route.router, prefix="/api", tags=["metrics"])

    return app


# 直接运行时入口
app = create_app()