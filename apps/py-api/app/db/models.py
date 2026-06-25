"""SQLAlchemy ORM models · 对齐 NestJS prisma/schema.prisma

P1-9 修复：补 L4 PostgreSQL 长期持久化
- Interview：每场面试
- SessionCost：会话级成本（llm_calls / tokens / cache / retries）
- Message：对话消息
- User：用户

2026-06-25 web ↔ py-api 对齐：补 Resume + Report 表
- Resume：简历内容（1:1 Interview，存解析后的结构化数据 + 原始文本）
- Report：评分报告（1:1 Interview，多维度评分 + 评语）

2026-06-25 列名映射修复：DB 实际列名是 camelCase（NestJS Prisma 风格），
SQLAlchemy 默认 snake_case，所以每个 Column 必须显式 name= 映射到 DB 实际列名。

设计原则：
- 字段名 / 类型对齐 NestJS Prisma
- alembic 做 migration（vs NestJS 的 prisma migrate）
- SQLAlchemy declarative_base（v2 风格兼容）
"""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone

# SQLAlchemy naming convention：column 用 column.key（保持 snake_case），
# 但因为我们用 Column("createdAt", ...) 显式映射到 DB 实际列名，
# 所以这里的 convention 只影响 FK constraint name。
from sqlalchemy import MetaData
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
Base = declarative_base(metadata=MetaData(naming_convention=NAMING_CONVENTION))


class User(Base):
    """用户 · 对齐 NestJS User"""
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    avatarUrl = Column("avatarUrl", String, nullable=True)
    createdAt = Column("createdAt", DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updatedAt = Column("updatedAt", DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class Interview(Base):
    """面试 · 对齐 NestJS Interview"""
    __tablename__ = "interviews"

    id = Column(String, primary_key=True)
    userId = Column("userId", String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(String, nullable=False)
    level = Column(String, default="P5")
    status = Column(String, default="IN_PROGRESS")  # IN_PROGRESS / COMPLETED / FAILED
    startedAt = Column("startedAt", DateTime, default=lambda: datetime.now(timezone.utc))
    endedAt = Column("endedAt", DateTime, nullable=True)
    summary = Column(Text, nullable=True)
    resumeConfirmed = Column("resumeConfirmed", Boolean, default=False)

    cost = relationship("SessionCost", uselist=False, back_populates="interview", cascade="all, delete-orphan")
    resume = relationship("Resume", uselist=False, back_populates="interview", cascade="all, delete-orphan")
    report = relationship("Report", uselist=False, back_populates="interview", cascade="all, delete-orphan")


class SessionCost(Base):
    """会话级成本面板 · 对齐 NestJS SessionCost

    每场 interview 一行，累加式写入
    """
    __tablename__ = "session_costs"

    id = Column(String, primary_key=True)
    interviewId = Column("interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE"), unique=True)

    # === 基础计数 ===
    llmCalls = Column("llmCalls", Integer, default=0)
    totalPromptTokens = Column("totalPromptTokens", Integer, default=0)
    totalCompletionTokens = Column("totalCompletionTokens", Integer, default=0)
    totalTokens = Column("totalTokens", Integer, default=0)

    # === 缓存命中 ===
    promptCacheHits = Column("promptCacheHits", Integer, default=0)
    promptCacheMisses = Column("promptCacheMisses", Integer, default=0)
    cachedTokens = Column("cachedTokens", Integer, default=0)
    semanticCacheHits = Column("semanticCacheHits", Integer, default=0)
    semanticCacheMisses = Column("semanticCacheMisses", Integer, default=0)
    cacheSavedTokens = Column("cacheSavedTokens", Integer, default=0)

    # === 鲁棒性 ===
    retries = Column(Integer, default=0)
    fallbacks = Column(Integer, default=0)
    errors = Column(Integer, default=0)

    # === 成本（分，避免浮点） ===
    estimatedCostCny = Column("estimatedCostCny", Integer, default=0)

    # === 时间戳（Prisma 表实际有 startedAt / endedAt / updatedAt，无 createdAt） ===
    startedAt = Column("startedAt", DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    endedAt = Column("endedAt", DateTime, nullable=True)
    updatedAt = Column("updatedAt", DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, onupdate=lambda: datetime.now(timezone.utc))

    interview = relationship("Interview", back_populates="cost")


class Message(Base):
    """对话消息 · 对齐 NestJS Message"""
    __tablename__ = "messages"

    id = Column(String, primary_key=True)
    interviewId = Column("interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)  # user / assistant / system
    content = Column(Text, nullable=False)
    createdAt = Column("createdAt", DateTime, default=lambda: datetime.now(timezone.utc))


class Resume(Base):
    """简历 · 2026-06-25 web ↔ py-api 对齐新增

    1:1 Interview，存原始文本 + 解析后的 JSON
    """
    __tablename__ = "resumes"

    id = Column(String, primary_key=True)
    interviewId = Column("interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE"), unique=True)
    userId = Column("userId", String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    fileName = Column("fileName", String, nullable=True)
    fileType = Column("fileType", String, nullable=True)
    rawText = Column("rawText", Text, nullable=False)
    parsedJson = Column("parsedJson", Text, nullable=True)
    charCount = Column("charCount", Integer, default=0)
    createdAt = Column("createdAt", DateTime, default=lambda: datetime.now(timezone.utc))

    interview = relationship("Interview", back_populates="resume")


class Report(Base):
    """评分报告 · 2026-06-25 web ↔ py-api 对齐新增

    1:1 Interview，多维度评分 + 评语
    """
    __tablename__ = "reports"

    id = Column(String, primary_key=True)
    interviewId = Column("interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE"), unique=True)
    overallScore = Column("overallScore", Integer, default=0)
    scoresJson = Column("scoresJson", Text, nullable=True)
    strengths = Column(Text, nullable=True)
    weaknesses = Column(Text, nullable=True)
    suggestions = Column(Text, nullable=True)
    createdAt = Column("createdAt", DateTime, default=lambda: datetime.now(timezone.utc))

    interview = relationship("Interview", back_populates="report")