"""users.id CHECK constraint + 长度上限 — R-AUTH-1 防恶意注入。

与 NestJS prisma 侧一致：prisma.user 表 id 是 String @id，没有 CHECK。
Python SQLAlchemy 加 CHECK 约束对齐 SAFE_USERID_REGEX ^[a-z0-9][a-z0-9_-]{2,31}$。

为什么 DB 加 CHECK 而非只在应用层：
1. 多端写入保护（NestJS + Python + 任何直连 PG 的工具都必须遵守）
2. 防 SQL 注入绕过应用层校验（即使应用被绕过，DB 拒绝）
3. 数据完整性（id 字段永远是合法 user ID）

注意：旧数据 demo-user-* 前缀虽然不在新正则 ^[a-z0-9][a-z0-9_-]{2,31}$ 中
（如 demo-user-mqwm6hvt-62606bbc 含多个 dash + 长字符串），但实际字符都是
合法 [a-z0-9_-]，新正则不允许 'd' 开头以外的内容——等等，新正则是 ^[a-z0-9]
开头即字母或数字，所以 demo-user-* 都符合（d 是字母）。
但包含多个连续 dash 也没问题（新正则允许 [a-z0-9_-] 后续字符）。
注意新正则要求总长 3-32，demo-user-mqwm6hvt-62606bbc 是 27 字符，符合。

Revision ID: 002_users_id_check
Revises: 001_init
Create Date: 2026-06-28 14:50:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_users_id_check"
down_revision: Union[str, None] = "001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """加 users.id CHECK 约束。

    约束条件：^[a-z0-9][a-z0-9_-]{2,31}$
    - 长度：3-32 字符
    - 首字符：小写字母或数字
    - 后续字符：小写字母、数字、-、_
    """
    op.create_check_constraint(
        constraint_name="users_id_format_check",
        table_name="users",
        condition="id ~ '^[a-z0-9][a-z0-9_-]{2,31}$'",
    )

    # users.email 长度上限（防止超长 email）
    # email 形式：{userId}@local = userId (3-32) + @ + local (5) = 最长 38
    op.create_check_constraint(
        constraint_name="users_email_length_check",
        table_name="users",
        condition="length(email) <= 100",
    )


def downgrade() -> None:
    """删 CHECK 约束。"""
    op.drop_constraint("users_id_format_check", "users", type_="check")
    op.drop_constraint("users_email_length_check", "users", type_="check")
