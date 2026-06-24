"""
py-api: FastAPI 版面试 Agent 后端（与 NestJS 版并行）

架构对齐 apps/api/src/agents/multi-agent/:
- 5 节点多 Agent（supervisor / planner / executor / replanner / reviewer）
- 4 层记忆（Redis 工作记忆 + Redis 会话 + Milvus/Mem0 长期 + Prisma 画像）
- LangGraph v0.5 StateGraph
- FastAPI 0.115 + uvicorn

启动：
    uvicorn app.main:app --reload --port 3002

或 docker-compose：
    docker compose up py-api
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.routes import interview, auth, health
from app.agents.graph import build_interview_graph
from app.memory.redis_memory import RedisMemory
from app.memory.milvus_memory import MilvusMemory
from app.memory.mem0_memory import Mem0Memory


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动 / 关闭钩子：初始化 4 层记忆 + 编译 LangGraph"""
    # L1/L2: Redis 工作记忆 + 会话
    redis_mem = RedisMemory(url=app.state.settings.REDIS_URL)
    await redis_mem.connect()

    # L3: Milvus + Mem0 长期记忆
    milvus_mem = MilvusMemory(url=app.state.settings.MILVUS_URL)
    await milvus_mem.connect()

    mem0_mem = Mem0Memory(
        api_key=app.state.settings.MEM0_API_KEY,
        host=app.state.settings.MEM0_HOST,
    )

    # 编译 5 节点 LangGraph
    graph = await build_interview_graph(
        redis_mem=redis_mem,
        milvus_mem=milvus_mem,
        mem0_mem=mem0_mem,
        settings=app.state.settings,
    )

    app.state.redis_mem = redis_mem
    app.state.milvus_mem = milvus_mem
    app.state.mem0_mem = mem0_mem
    app.state.interview_graph = graph

    yield

    await redis_mem.close()
    await milvus_mem.close()


def create_app(settings=None) -> FastAPI:
    app = FastAPI(
        title="interview-agent-2 Python API",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS（与 NestJS 版一致）
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 路由
    app.include_router(health.router, prefix="/api/health", tags=["health"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(interview.router, prefix="/api/interview", tags=["interview"])

    return app


# 直接运行时入口
app = create_app()