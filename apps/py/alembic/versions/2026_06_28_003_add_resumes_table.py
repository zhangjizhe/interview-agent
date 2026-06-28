"""resumes 表 — 简历持久化 R7-fix(R-AUTH-2 + B5 + B6)。

R-AUTH-2 治本方案 B (2026-06-28)：
把 PG `resumes` 表作为 resume 业务链路的 source of truth，
Mem0 只做语义检索（不可靠/有 quota 限制）。

表结构对齐 NestJS prisma schema（NestJS 端没有 resume 表，先在 Python 端建，
未来 NestJS 端需要时可同步建同样结构的表 — 字段名 / 类型 1:1）。

字段设计：
- id (cuid) — 主键
- user_id (FK → users.id, ON DELETE CASCADE) — 简历所属用户
- position — 岗位（与 Interview.position 对齐）
- file_name — 上传时的文件名
- file_path — 文件存储路径（生产用 S3 / 本地 demo 路径）
- file_size — 文件字节数
- content_type — MIME type（application/pdf / text/plain / text/markdown）
- parsed_text — 解析后的全文（用于 BM25 关键词搜索，nullable）
- parsed_skills — 提取的技能（JSONB 数组，对齐 NestJS ParsedResume.skills）
- parsed_json — 完整 parsed 结构（JSONB，含 name/email/education/experience/projects）
- qdrant_point_id — Qdrant 向量点 ID（nullable，向量检索时用）
- created_at — 上传时间（索引：DESC 用于"取最新"）
- updated_at — 更新时间

索引：
- user_id（快速按用户查）
- (user_id, created_at desc)（按用户取最新简历 — ResumeRAGService.search_by_user 主路径）

Revision ID: 003_add_resumes_table
Revises: 002_users_id_check
Create Date: 2026-06-28 16:50:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_add_resumes_table"
down_revision: Union[str, None] = "002_users_id_check"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """建 resumes 表 + 索引。"""
    op.create_table(
        "resumes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("userId", sa.String(), nullable=False),
        sa.Column("position", sa.String(), nullable=False),
        sa.Column("fileName", sa.String(), nullable=False),
        sa.Column("filePath", sa.String(), nullable=False),
        sa.Column("fileSize", sa.Integer(), nullable=False),
        sa.Column("contentType", sa.String(), nullable=False, server_default="application/pdf"),
        sa.Column("parsedText", sa.Text(), nullable=True),
        sa.Column("parsedSkills", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("parsedJson", postgresql.JSONB(), nullable=True),
        sa.Column("qdrantPointId", sa.String(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["userId"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # user_id 索引（按用户快速查所有简历）
    op.create_index("ix_resumes_userId", "resumes", ["userId"])
    # (user_id, created_at desc) 复合索引 — ResumeRAGService.search_by_user 主路径
    # ⚠️ sa.text 不会自动 quote 列名，PG case-fold createdAt → createdat 报不存在
    # 用 execute 跑 raw SQL 强制 quote
    op.execute(
        'CREATE INDEX "ix_resumes_userId_createdAt_desc" '
        'ON resumes ("userId", "createdAt" DESC)'
    )


def downgrade() -> None:
    """删 resumes 表。"""
    op.execute('DROP INDEX IF EXISTS "ix_resumes_userId_createdAt_desc"')
    op.drop_index("ix_resumes_userId", table_name="resumes")
    op.drop_table("resumes")
