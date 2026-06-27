"""Alembic env — async 迁移支持。

对齐 NestJS Prisma migrate：
- alembic upgrade head  ≡  npx prisma migrate deploy
- alembic revision --autogenerate -m "msg"  ≡  npx prisma migrate dev --name init
"""
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# 把 src 加进 sys.path（alembic.ini 已配 prepend_sys_path = src）
from interview_agent.config import settings
from interview_agent.infra.models import Base

config = context.config


def _async_url(sync_url: str) -> str:
    """Sync `postgresql://...` → async `postgresql+asyncpg://...`。

    alembic.ini 用 postgresql:// 形式（与 NestJS .env 一致），但 async migration 需要 asyncpg。
    """
    if sync_url.startswith("postgresql://"):
        return sync_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if sync_url.startswith("postgres://"):
        return sync_url.replace("postgres://", "postgresql+asyncpg://", 1)
    return sync_url


# 用环境变量 DATABASE_URL 覆盖 alembic.ini 里的 sqlalchemy.url
config.set_main_option("sqlalchemy.url", _async_url(settings.DATABASE_URL))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """OFFLINE 模式：只生成 SQL 不执行。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """ONLINE 模式（async）：连接 DB 执行迁移。"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()