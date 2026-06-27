"""initial schema — 8 tables (users / interviews / messages / reports / session_costs / interview_tasks / answer_histories / reflection_logs / user_tool_preferences)

Revision ID: 001_init
Revises:
Create Date: 2026-06-27 22:00:00

与 apps/api/prisma/schema.prisma 像素级对齐（字段名 / 类型 / nullable / 索引 / 约束）。
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ====== Enums ======
    interview_status = postgresql.ENUM(
        "IN_PROGRESS", "COMPLETED", "ABANDONED", name="interviewstatus", create_type=True
    )
    task_type = postgresql.ENUM(
        "QUESTION", "FOLLOW_UP", "SUMMARY", "EVALUATION", name="tasktype", create_type=True
    )
    task_status = postgresql.ENUM(
        "PENDING", "COMPLETED", "SKIPPED", name="taskstatus", create_type=True
    )
    interview_status.create(op.get_bind(), checkfirst=True)
    task_type.create(op.get_bind(), checkfirst=True)
    task_status.create(op.get_bind(), checkfirst=True)

    # ====== users ======
    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("avatarUrl", sa.String(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    # ====== interviews ======
    op.create_table(
        "interviews",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("userId", sa.String(), nullable=False),
        sa.Column("position", sa.String(), nullable=False),
        sa.Column("level", sa.String(), nullable=False, server_default="P5"),
        sa.Column("status", interview_status, nullable=False, server_default="IN_PROGRESS"),
        sa.Column("startedAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("endedAt", sa.DateTime(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("resumeConfirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["userId"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_interviews_userId_startedAt", "interviews", ["userId", "startedAt"])

    # ====== session_costs ======
    op.create_table(
        "session_costs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("interviewId", sa.String(), nullable=False),
        sa.Column("llmCalls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("totalPromptTokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("totalCompletionTokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("totalTokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("promptCacheHits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("promptCacheMisses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cachedTokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("semanticCacheHits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("semanticCacheMisses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cacheSavedTokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retries", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fallbacks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("inputCostPer1k", sa.Float(), nullable=False, server_default="0"),
        sa.Column("outputCostPer1k", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cacheDiscount", sa.Float(), nullable=False, server_default="0.4"),
        sa.Column("estimatedCostCny", sa.Float(), nullable=False, server_default="0"),
        sa.Column("startedAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("endedAt", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["interviewId"], ["interviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interviewId"),
    )
    op.create_index("ix_session_costs_interviewId", "session_costs", ["interviewId"])

    # ====== messages ======
    op.create_table(
        "messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("interviewId", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("promptTokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completionTokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["interviewId"], ["interviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messages_interviewId_createdAt", "messages", ["interviewId", "createdAt"])

    # ====== reports ======
    op.create_table(
        "reports",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("interviewId", sa.String(), nullable=False),
        sa.Column("overallScore", sa.Integer(), nullable=False),
        sa.Column("scores", postgresql.JSONB(), nullable=False),
        sa.Column("strengths", sa.Text(), nullable=False),
        sa.Column("weaknesses", sa.Text(), nullable=False),
        sa.Column("suggestions", sa.Text(), nullable=False),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["interviewId"], ["interviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interviewId"),
    )

    # ====== user_tool_preferences ======
    op.create_table(
        "user_tool_preferences",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("userId", sa.String(), nullable=False),
        sa.Column("toolName", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("config", postgresql.JSONB(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("userId", "toolName", name="uq_user_tool_pref_userId_toolName"),
    )
    op.create_index("ix_user_tool_pref_userId", "user_tool_preferences", ["userId"])

    # ====== interview_tasks ======
    op.create_table(
        "interview_tasks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("interviewId", sa.String(), nullable=False),
        sa.Column("type", task_type, nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("difficulty", sa.String(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("context", postgresql.JSONB(), nullable=True),
        sa.Column("status", task_status, nullable=False, server_default="PENDING"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["interviewId"], ["interviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_interview_tasks_interviewId_status_priority",
        "interview_tasks",
        ["interviewId", "status", "priority"],
    )

    # ====== answer_histories ======
    op.create_table(
        "answer_histories",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("interviewId", sa.String(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("completeness", sa.Float(), nullable=False, server_default="0"),
        sa.Column("correctness", sa.Float(), nullable=False, server_default="0"),
        sa.Column("depth", sa.Float(), nullable=False, server_default="0"),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("llmEvaluated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["interviewId"], ["interviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_answer_histories_interviewId", "answer_histories", ["interviewId"])

    # ====== reflection_logs ======
    op.create_table(
        "reflection_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("interviewId", sa.String(), nullable=False),
        sa.Column("userId", sa.String(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("finalResponse", sa.Text(), nullable=False),
        sa.Column("reviewScore", sa.Float(), nullable=False),
        sa.Column("reviewIssues", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("issueTags", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("reflection", sa.Text(), nullable=True),
        sa.Column("retryCount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hitlPending", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("modelName", sa.String(), nullable=False),
        sa.Column("nodeName", sa.String(), nullable=False, server_default="reviewer"),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["interviewId"], ["interviews.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["userId"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reflection_logs_interviewId", "reflection_logs", ["interviewId"])
    op.create_index("ix_reflection_logs_userId", "reflection_logs", ["userId"])
    op.create_index("ix_reflection_logs_createdAt", "reflection_logs", ["createdAt"])
    op.create_index("ix_reflection_logs_reviewScore", "reflection_logs", ["reviewScore"])
    op.create_index(
        "ix_reflection_logs_issueTags", "reflection_logs", ["issueTags"], postgresql_using="gin"
    )


def downgrade() -> None:
    op.drop_index("ix_reflection_logs_issueTags", table_name="reflection_logs")
    op.drop_index("ix_reflection_logs_reviewScore", table_name="reflection_logs")
    op.drop_index("ix_reflection_logs_createdAt", table_name="reflection_logs")
    op.drop_index("ix_reflection_logs_userId", table_name="reflection_logs")
    op.drop_index("ix_reflection_logs_interviewId", table_name="reflection_logs")
    op.drop_table("reflection_logs")

    op.drop_index("ix_answer_histories_interviewId", table_name="answer_histories")
    op.drop_table("answer_histories")

    op.drop_index(
        "ix_interview_tasks_interviewId_status_priority", table_name="interview_tasks"
    )
    op.drop_table("interview_tasks")

    op.drop_index("ix_user_tool_pref_userId", table_name="user_tool_preferences")
    op.drop_table("user_tool_preferences")

    op.drop_table("reports")

    op.drop_index("ix_messages_interviewId_createdAt", table_name="messages")
    op.drop_table("messages")

    op.drop_index("ix_session_costs_interviewId", table_name="session_costs")
    op.drop_table("session_costs")

    op.drop_index("ix_interviews_userId_startedAt", table_name="interviews")
    op.drop_table("interviews")

    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS taskstatus")
    op.execute("DROP TYPE IF EXISTS tasktype")
    op.execute("DROP TYPE IF EXISTS interviewstatus")