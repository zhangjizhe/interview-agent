"""ORM Models — 与 `apps/api/prisma/schema.prisma` 像素级对齐。

字段名 / 类型 / nullable / 索引 / 关系 / enum 全部 1:1 对齐。
NestJS 端用 PrismaClient 自动生成类型；Python 端用 SQLAlchemy 2.x Declarative + Mapped。
"""
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ============================================================
# Enums — 与 Prisma enum 像素级对齐
# ============================================================


class InterviewStatus(str, Enum):
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    ABANDONED = "ABANDONED"


class TaskType(str, Enum):
    QUESTION = "QUESTION"
    FOLLOW_UP = "FOLLOW_UP"
    SUMMARY = "SUMMARY"
    EVALUATION = "EVALUATION"


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"


# ============================================================
# Models
# ============================================================


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # cuid
    email: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column("avatarUrl", String, nullable=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    interviews: Mapped[list["Interview"]] = relationship(back_populates="user")
    reflection_logs: Mapped[list["ReflectionLog"]] = relationship(back_populates="user")


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column("userId", String, ForeignKey("users.id", ondelete="CASCADE"))
    position: Mapped[str] = mapped_column(String)  # 岗位
    level: Mapped[str] = mapped_column(String, default="P5")  # 职级
    status: Mapped[InterviewStatus] = mapped_column(
        SAEnum(InterviewStatus, name="InterviewStatus"), default=InterviewStatus.IN_PROGRESS
    )
    started_at: Mapped[datetime] = mapped_column("startedAt", DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column("endedAt", DateTime, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_confirmed: Mapped[bool] = mapped_column("resumeConfirmed", Boolean, default=False)

    user: Mapped[User] = relationship(back_populates="interviews")
    messages: Mapped[list["Message"]] = relationship(back_populates="interview")
    report: Mapped["Report | None"] = relationship(back_populates="interview", uselist=False)
    cost: Mapped["SessionCost | None"] = relationship(back_populates="interview", uselist=False)
    tasks: Mapped[list["InterviewTask"]] = relationship(back_populates="interview")
    answer_histories: Mapped[list["AnswerHistory"]] = relationship(back_populates="interview")
    reflection_logs: Mapped[list["ReflectionLog"]] = relationship(back_populates="interview")

    __table_args__ = (Index("ix_interviews_userId_startedAt", "userId", "startedAt"),)


class SessionCost(Base):
    __tablename__ = "session_costs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    interview_id: Mapped[str] = mapped_column(
        "interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE"), unique=True
    )

    # 基础计数
    llm_calls: Mapped[int] = mapped_column("llmCalls", Integer, default=0)
    total_prompt_tokens: Mapped[int] = mapped_column("totalPromptTokens", Integer, default=0)
    total_completion_tokens: Mapped[int] = mapped_column("totalCompletionTokens", Integer, default=0)
    total_tokens: Mapped[int] = mapped_column("totalTokens", Integer, default=0)

    # 缓存命中
    prompt_cache_hits: Mapped[int] = mapped_column("promptCacheHits", Integer, default=0)
    prompt_cache_misses: Mapped[int] = mapped_column("promptCacheMisses", Integer, default=0)
    cached_tokens: Mapped[int] = mapped_column("cachedTokens", Integer, default=0)
    semantic_cache_hits: Mapped[int] = mapped_column("semanticCacheHits", Integer, default=0)
    semantic_cache_misses: Mapped[int] = mapped_column("semanticCacheMisses", Integer, default=0)
    cache_saved_tokens: Mapped[int] = mapped_column("cacheSavedTokens", Integer, default=0)

    # 鲁棒性
    retries: Mapped[int] = mapped_column(Integer, default=0)
    fallbacks: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[int] = mapped_column(Integer, default=0)

    # 成本（CNY）
    input_cost_per_1k: Mapped[float] = mapped_column("inputCostPer1k", Float, default=0)
    output_cost_per_1k: Mapped[float] = mapped_column("outputCostPer1k", Float, default=0)
    cache_discount: Mapped[float] = mapped_column("cacheDiscount", Float, default=0.4)
    estimated_cost_cny: Mapped[float] = mapped_column("estimatedCostCny", Float, default=0)

    # 时间
    started_at: Mapped[datetime] = mapped_column("startedAt", DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    ended_at: Mapped[datetime | None] = mapped_column("endedAt", DateTime, nullable=True)

    interview: Mapped[Interview] = relationship(back_populates="cost")

    __table_args__ = (Index("ix_session_costs_interviewId", "interviewId"),)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    interview_id: Mapped[str] = mapped_column(
        "interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String)  # system | user | assistant | tool
    content: Mapped[str] = mapped_column(Text)
    # metadata: Prisma JSON → PostgreSQL JSONB（Python 端用 JSON）
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    prompt_tokens: Mapped[int] = mapped_column("promptTokens", Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column("completionTokens", Integer, default=0)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=datetime.utcnow)

    interview: Mapped[Interview] = relationship(back_populates="messages")

    __table_args__ = (Index("ix_messages_interviewId_createdAt", "interviewId", "createdAt"),)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    interview_id: Mapped[str] = mapped_column(
        "interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE"), unique=True
    )
    overall_score: Mapped[int] = mapped_column("overallScore", Integer)  # 0-100
    scores: Mapped[dict] = mapped_column(JSON)  # 多维度评分
    strengths: Mapped[str] = mapped_column(Text)
    weaknesses: Mapped[str] = mapped_column(Text)
    suggestions: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=datetime.utcnow)

    interview: Mapped[Interview] = relationship(back_populates="report")


class UserToolPreference(Base):
    __tablename__ = "user_tool_preferences"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column("userId", String)
    tool_name: Mapped[str] = mapped_column("toolName", String)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config_: Mapped[dict | None] = mapped_column("config", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        Index("uq_user_tool_pref_userId_toolName", "userId", "toolName", unique=True),
        Index("ix_user_tool_pref_userId", "userId"),
    )


class InterviewTask(Base):
    __tablename__ = "interview_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    interview_id: Mapped[str] = mapped_column(
        "interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE")
    )
    type: Mapped[TaskType] = mapped_column(SAEnum(TaskType, name="TaskType"))
    question: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String)
    difficulty: Mapped[str] = mapped_column(String)  # easy | medium | hard
    priority: Mapped[int] = mapped_column(Integer, default=0)
    context_: Mapped[dict | None] = mapped_column("context", JSON, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        SAEnum(TaskStatus, name="TaskStatus"), default=TaskStatus.PENDING
    )
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    interview: Mapped[Interview] = relationship(back_populates="tasks")

    __table_args__ = (Index("ix_interview_tasks_interviewId_status_priority", "interviewId", "status", "priority"),)


class AnswerHistory(Base):
    __tablename__ = "answer_histories"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    interview_id: Mapped[str] = mapped_column(
        "interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE")
    )
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(Float, default=0)  # 0-1
    completeness: Mapped[float] = mapped_column(Float, default=0)
    correctness: Mapped[float] = mapped_column(Float, default=0)
    depth: Mapped[float] = mapped_column(Float, default=0)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_evaluated: Mapped[bool] = mapped_column("llmEvaluated", Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=datetime.utcnow)

    interview: Mapped[Interview] = relationship(back_populates="answer_histories")

    __table_args__ = (Index("ix_answer_histories_interviewId", "interviewId"),)


class Resume(Base):
    """简历持久化（R7-fix / R-AUTH-2 治本方案 B，2026-06-28）。

    PG `resumes` 表作为 resume 业务链路 source of truth，
    Mem0 只做语义检索（不可靠/有 quota 限制）。

    字段对齐 NestJS ParsedResume 接口（name/email/position/yearsOfExperience/
    skills/education/experience/projects/keywords/seniority/summary）。
    NestJS prisma schema 当前没有 Resume 模型（我们先建，未来 NestJS 可同步建）。

    Alembic migration: 2026_06_28_003_add_resumes_table.py
    """

    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # cuid
    user_id: Mapped[str] = mapped_column(
        "userId", String, ForeignKey("users.id", ondelete="CASCADE")
    )
    position: Mapped[str] = mapped_column(String)  # 岗位
    file_name: Mapped[str] = mapped_column("fileName", String)  # 上传文件名
    file_path: Mapped[str] = mapped_column("filePath", String)  # 存储路径
    file_size: Mapped[int] = mapped_column("fileSize", Integer)  # 字节
    content_type: Mapped[str] = mapped_column(
        "contentType", String, default="application/pdf"
    )  # MIME
    parsed_text: Mapped[str | None] = mapped_column("parsedText", Text, nullable=True)
    parsed_skills: Mapped[list[str] | None] = mapped_column(
        "parsedSkills", ARRAY(String), nullable=True
    )
    parsed_json: Mapped[dict | None] = mapped_column("parsedJson", JSONB, nullable=True)
    qdrant_point_id: Mapped[str | None] = mapped_column("qdrantPointId", String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        Index("ix_resumes_userId", "userId"),
        Index("ix_resumes_userId_createdAt_desc", "userId", "createdAt"),
    )


class ReflectionLog(Base):
    __tablename__ = "reflection_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    interview_id: Mapped[str] = mapped_column(
        "interviewId", String, ForeignKey("interviews.id", ondelete="CASCADE")
    )
    user_id: Mapped[str] = mapped_column(
        "userId", String, ForeignKey("users.id", ondelete="CASCADE")
    )
    question: Mapped[str] = mapped_column(Text)
    final_response: Mapped[str] = mapped_column("finalResponse", Text)
    review_score: Mapped[float] = mapped_column("reviewScore", Float)  # 0-1
    review_issues: Mapped[list[str]] = mapped_column("reviewIssues", ARRAY(String))
    issue_tags: Mapped[list[str]] = mapped_column("issueTags", ARRAY(String))
    reflection: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column("retryCount", Integer, default=0)
    hitl_pending: Mapped[bool] = mapped_column("hitlPending", Boolean, default=False)
    model_name: Mapped[str] = mapped_column("modelName", String)
    node_name: Mapped[str] = mapped_column("nodeName", String, default="reviewer")
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=datetime.utcnow)

    interview: Mapped[Interview] = relationship(back_populates="reflection_logs")
    user: Mapped[User] = relationship(back_populates="reflection_logs")

    __table_args__ = (
        Index("ix_reflection_logs_interviewId", "interviewId"),
        Index("ix_reflection_logs_userId", "userId"),
        Index("ix_reflection_logs_createdAt", "createdAt"),
        Index("ix_reflection_logs_reviewScore", "reviewScore"),
        Index("ix_reflection_logs_issueTags", "issueTags", postgresql_using="gin"),
    )