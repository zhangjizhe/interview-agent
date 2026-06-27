"""SQLAlchemy 2.x async 引擎 + session factory。

对齐 NestJS PrismaService 的语义：
- 全局单例 async engine
- lazy connect（首次使用时连接）
- lifespan 启动时 warm-up，关闭时 dispose
- session 通过 FastAPI Depends 注入
"""
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from interview_agent.config import settings
from interview_agent.infra.models import Base


def _async_url(sync_url: str) -> str:
    """Sync `postgresql://...` → async `postgresql+asyncpg://...`。

    .env.example 与 NestJS 1:1 保持 `postgresql://` 形式（不变）；
    SQLAlchemy async engine 需要显式 asyncpg driver。
    """
    if sync_url.startswith("postgresql://"):
        return sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if sync_url.startswith("postgres://"):
        return sync_url.replace("postgres://", "postgresql+asyncpg://", 1)
    return sync_url


# async engine — 与 PrismaClient $connect 等价
# pool_pre_ping=True 防止 long-lived 连接被 PG 关闭后复用失败
_engine = create_async_engine(
    _async_url(settings.DATABASE_URL),
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# async session factory
async_session_factory = async_sessionmaker(
    bind=_engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def init_db() -> None:
    """对齐 PrismaService.onModuleInit：连接 DB + 日志。

    生产环境推荐用 Alembic 迁移（alembic upgrade head），不需要 create_all。
    这里 create_all 仅供 demo / 测试快速启动。
    """
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """对齐 PrismaService.onModuleDestroy。"""
    await _engine.dispose()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI Depends：每个请求一个 session，请求结束自动 close。

    业务用法：
    ```python
    @router.get("/items")
    async def list_items(session: SessionDep):
        result = await session.execute(select(Item))
        return result.scalars().all()
    ```
    """
    async with async_session_factory() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]