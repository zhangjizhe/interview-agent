"""SQLAlchemy DB session · 对齐 NestJS PrismaService

P1-9 修复：补 L4 PostgreSQL 长期持久化
- engine：从 settings.DATABASE_URL 创建
- SessionLocal：每次请求一个 session
- init_db：lifespan 钩子调用，建表（dev 用，生产用 alembic upgrade head）
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from typing import Generator

from app.db.models import Base


def make_engine(database_url: str):
    """创建 SQLAlchemy engine"""
    return create_engine(
        database_url,
        pool_pre_ping=True,  # 防 stale connection
        pool_size=5,
        max_overflow=10,
        echo=False,  # 生产关掉 SQL 日志
    )


def make_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


# 全局实例（lifespan 注入 app.state）
_engine = None
_SessionLocal = None


def init_db(database_url: str):
    """lifespan 钩子调用：建 engine + session factory + 自动建表（dev 友好）

    生产应该用 alembic upgrade head，这里用 Base.metadata.create_all 作 dev fallback。
    """
    global _engine, _SessionLocal
    _engine = make_engine(database_url)
    _SessionLocal = make_session_factory(_engine)
    # dev 自动建表（生产应该 alembic）
    Base.metadata.create_all(bind=_engine)


def close_db():
    """lifespan 关闭钩子"""
    global _engine
    if _engine:
        _engine.dispose()


@contextmanager
def get_db() -> Generator[Session, None, None]:
    """获取数据库 session（上下文管理器）

    用法：
        with get_db() as db:
            db.add(interview)
            db.commit()
    """
    if _SessionLocal is None:
        raise RuntimeError("DB not initialized. Call init_db() in lifespan first.")
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()