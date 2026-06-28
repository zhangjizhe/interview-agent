"""FastAPI 启动入口 — 与 NestJS main.ts 像素级对齐。

所有 router 挂载：
- /health（liveness）/health/ready（readiness）— api/health.py
- /api/auth/*   — auth/auth_controller.py
- /api/user/*   — user/user_controller.py
- /api/interview/* — interview/interview_controller.py（main router）
- /api/hitl/*   — hitl endpoints（interview_controller.hitl_router）
- /api/session/:id/cost — cost endpoint（interview_controller.cost_router）
- /api/tools — tools list（mcp/mcp_controller.py）
- /api/admin/mcp/* — mcp admin（mcp/mcp_controller.py）
- /api/knowledge-base/* — knowledge-base/knowledge_base_controller.py
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.responses import JSONResponse

from interview_agent.api.health import router as health_router
from interview_agent.common.logging import setup_logging
from interview_agent.config import settings
from interview_agent.infra.db import close_db, init_db
from interview_agent.infra.redis_client import close_redis, init_redis
from interview_agent.modules.agent.services.dynamic_task_queue import (
    DynamicTaskQueue,
)
from interview_agent.modules.auth.auth_controller import router as auth_router
from interview_agent.modules.auth.throttler import limiter
from interview_agent.modules.interview.interview_controller import (
    cost_router,
    hitl_router,
    router as interview_router,
)
from interview_agent.modules.interview.lifecycle_controller import (
    kb_list_router,
    lifecycle_router,
    metrics_router,
    question_bank_router,
)
from interview_agent.modules.interview.question_bank_controller import (
    router as question_bank_router_v2,
)
from interview_agent.modules.interview.evaluation_controller import (
    router as evaluation_router,
)
from interview_agent.modules.interview.resume_controller import (
    router as resume_router,
)
from interview_agent.modules.mcp.mcp_controller import (
    admin_mcp_servers_router,
    mcp_admin_router,
    tools_router,
)
from interview_agent.modules.knowledge_base.knowledge_base_controller import (
    router as kb_router,
)
from interview_agent.modules.mcp.mcp_controller import (
    mcp_admin_router,
    tools_router,
)
from interview_agent.modules.user.user_controller import router as user_router

setup_logging(settings.LOG_LEVEL)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Interview Agent (Python) starting...")
    logger.info(f"   NODE_ENV: {settings.NODE_ENV}")
    logger.info(f"   AGENT_ENGINE: {settings.AGENT_ENGINE}")

    # ===== Startup fail-fast checks（2026-06-28：防止漏装 / placeholder）=====
    # 1. openai 包必须可导入（真 LLM 路径需要）
    try:
        import openai  # noqa: F401
        logger.info("✅ openai SDK present")
    except ImportError:
        logger.error(
            "❌ openai SDK missing! Run: cd apps/py && pip install -e .\n"
            "   (pyproject.toml 已经声明 openai>=1.50.0，但 venv 可能没 sync)"
        )
        raise RuntimeError("openai SDK missing — run `pip install -e apps/py`") from None

    # 2. LLM API key 校验（商用 fail-fast）
    qwen_len = len(settings.QWEN_API_KEY or "")
    deepseek_len = len(settings.DEEPSEEK_API_KEY or "")
    if qwen_len < 30 and deepseek_len < 30:
        logger.error(
            f"❌ Both QWEN_API_KEY (len={qwen_len}) and DEEPSEEK_API_KEY "
            f"(len={deepseek_len}) look like placeholders!\n"
            "   Commercial deploy needs REAL keys (>= 30 chars).\n"
            "   Edit .env and replace sk-placeholder with real keys from provider console."
        )
        raise RuntimeError(
            "No real LLM API key configured. Set QWEN_API_KEY (>= 30 chars) in .env"
        )
    if qwen_len < 30:
        logger.warning(f"⚠️  QWEN_API_KEY looks like placeholder (len={qwen_len})")
    if deepseek_len < 30:
        logger.warning(f"⚠️  DEEPSEEK_API_KEY looks like placeholder (len={deepseek_len})")

    # 连接基础设施（fail-fast）
    await init_db()
    logger.info("✅ Postgres connected")
    await init_redis()
    logger.info("✅ Redis connected")
    logger.info("✅ Health endpoint ready at GET /health + /health/ready")

    # 初始化 LLM Gateway
    from interview_agent.modules.llm.llm_gateway import LlmGateway
    gateway = LlmGateway.instance()
    logger.info(f"✅ LLM Gateway ready: {gateway.list_status()}")

    # 初始化 MCP 内置工具
    from interview_agent.modules.mcp.mcp_registry import register_builtin_tools
    register_builtin_tools()
    from interview_agent.modules.mcp.mcp_registry import McpRegistry
    n_tools = len(McpRegistry.instance().list())
    logger.info(f"✅ MCP {n_tools} builtin tools registered (bocha_search / memory_recall / knowledge_bank + 6 mcp)")

    yield

    logger.info("👋 Interview Agent (Python) shutting down...")
    await close_redis()
    await close_db()


app = FastAPI(
    title="Interview Agent API",
    version="0.1.0",
    description="AI 结构化面试系统 — Python 后端（与 NestJS 像素级等价）",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGIN.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Throttler
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):
    return JSONResponse(status_code=429, content={"statusCode": 429, "message": "Rate limit exceeded"})


# /health + /health/ready 不在 /api 下
app.include_router(health_router)


# /api/health + /api/health/ready — 与 NestJS setGlobalPrefix('api') 像素级对齐
# NestJS HealthController 路径是 /health，前端 nginx 反代后会变 /api/health。
# 前端代码可能直接调 /api/health，所以同时暴露这两条路径。
@app.get("/api/health")
async def api_health() -> dict:
    """Alias for /health（与 NestJS setGlobalPrefix('api') 等价）。"""
    from datetime import datetime, timezone
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/health/ready")
async def api_health_ready():
    """Alias for /health/ready。"""
    from interview_agent.api.health import readiness
    return await readiness()

# 业务路由统一 /api 前缀
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(user_router, prefix="/api/user", tags=["user"])
app.include_router(interview_router, prefix="/api/interview", tags=["interview"])
# 静态路由（必须先于动态 :id 注册，否则 FastAPI 会把 "upload-resume" 当 :id → 405）
app.include_router(resume_router, prefix="/api/interview", tags=["resume"])
app.include_router(question_bank_router_v2, prefix="/api/interview", tags=["question-bank-v2"])
app.include_router(evaluation_router, prefix="/api/interview", tags=["evaluation"])
# Lifecycle 静态路由（list/stats/empty-rooms/memories）必须在动态 :id 之前注册
app.include_router(lifecycle_router, prefix="/api", tags=["interview-lifecycle"])
app.include_router(metrics_router, prefix="/api", tags=["metrics"])
app.include_router(admin_mcp_servers_router, prefix="/api", tags=["admin-mcp-servers"])
# question-bank 静态路由必须在前（与 NestJS 路由顺序保证一致）
app.include_router(question_bank_router, prefix="/api", tags=["question-bank"])
app.include_router(kb_list_router, prefix="/api", tags=["knowledge-base"])
app.include_router(hitl_router, prefix="/api/hitl", tags=["hitl"])
app.include_router(cost_router, prefix="/api", tags=["cost"])
app.include_router(tools_router, prefix="/api/tools", tags=["tools"])
app.include_router(mcp_admin_router, prefix="/api/admin/mcp", tags=["mcp-admin"])
app.include_router(kb_router, prefix="/api", tags=["knowledge-base"])


@app.get("/")
async def root() -> dict:
    return {
        "name": "interview-agent-py",
        "version": "0.1.0",
        "engine": settings.AGENT_ENGINE,
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "interview_agent.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.NODE_ENV == "development",
        log_level=settings.LOG_LEVEL.lower(),
    )