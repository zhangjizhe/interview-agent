"""SQLAlchemy ORM models · 对齐 NestJS prisma/schema.prisma

P1-9 修复：补 L4 PostgreSQL 长期持久化
- Interview：每场面试
- SessionCost：会话级成本（llm_calls / tokens / cache / retries）
- Message：对话消息
- User：用户

设计原则：
- 字段名 / 类型对齐 NestJS Prisma
- alembic 做 migration（vs NestJS 的 prisma migrate）
- SQLAlchemy declarative_base（v2 风格兼容）
"""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone

Base = declarative_base()


class User(Base):
    """用户 · 对齐 NestJS User"""
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Interview(Base):
    """面试 · 对齐 NestJS Interview"""
    __tablename__ = "interviews"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(String, nullable=False)
    level = Column(String, default="P5")
    status = Column(String, default="IN_PROGRESS")  # IN_PROGRESS / COMPLETED / FAILED
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime, nullable=True)
    summary = Column(Text, nullable=True)
    resume_confirmed = Column(Boolean, default=False)

    cost = relationship("SessionCost", uselist=False, back_populates="interview", cascade="all, delete-orphan")

    __table_args__ = (
        # 复合索引：(user_id, started_at DESC)
        # 用途：查用户的面试列表按时间倒序
    )


class SessionCost(Base):
    """会话级成本面板 · 对齐 NestJS SessionCost（v11 cost-baseline 核心数据源）

    每场 interview 一行，累加式写入（llm.call 钩子 + 终态结算）
    """
    __tablename__ = "session_costs"

    id = Column(String, primary_key=True)
    interview_id = Column(String, ForeignKey("interviews.id", ondelete="CASCADE"), unique=True)

    # === 基础计数 ===
    llm_calls = Column(Integer, default=0)
    total_prompt_tokens = Column(Integer, default=0)
    total_completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)

    # === 缓存命中 ===
    prompt_cache_hits = Column(Integer, default=0)
    prompt_cache_misses = Column(Integer, default=0)
    cached_tokens = Column(Integer, default=0)
    semantic_cache_hits = Column(Integer, default=0)
    semantic_cache_misses = Column(Integer, default=0)
    cache_saved_tokens = Column(Integer, default=0)

    # === 鲁棒性 ===
    retries = Column(Integer, default=0)
    fallbacks = Column(Integer, default=0)
    errors = Column(Integer, default=0)

    # === 成本 ===
    estimated_cost_cny = Column(Integer, default=0)  # 分（避免浮点）

    interview = relationship("Interview", back_populates="cost")


class Message(Base):
    """对话消息 · 对齐 NestJS Message"""
    __tablename__ = "messages"

    id = Column(String, primary_key=True)
    interview_id = Column(String, ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)  # user / assistant / system
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))