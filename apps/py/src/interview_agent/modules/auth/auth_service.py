"""JWT 签发 / 校验 — 与 NestJS AuthService 像素级等价。

关键安全细节（必须 1:1 翻译）：
- demo 简化：userId 传进来即登录（不做密码验证）
- 严格 userId 格式校验：^[a-z0-9][a-z0-9_-]{2,31}$（R-AUTH-1）
- 保留名黑名单：admin/api/system/root 等 27 个系统名不能注册（R-AUTH-1）
- JWT 算法锁定 HS256（防 algorithm confusion attack：攻击者改 alg=none / RS256）
- payload: { sub: userId, email, exp }

R-AUTH-1 登录页面化（2026-06-28）：
- register(user_id, session): 新 ID 注册（已存在 → ConflictError）
- check_availability(user_id, session): 检查 ID 可用性（前端实时校验）
- login 自动 upsert User by id（保证 DB 里永远有 user 记录）
- LoginResult 加 email + name 字段（前端展示「我的 ID: xxx」用）

注意：PyJWT 2.x 没有 `expires_in` kwarg，过期时间通过 payload['exp'] 字段设置。
NestJS @nestjs/jwt 内部也是这个机制（自动把 expiresIn 转 exp）。
"""
import re
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

import jwt
from jwt.exceptions import InvalidTokenError
from sqlalchemy import select

from interview_agent.config import settings
from interview_agent.infra.models import User

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# R-AUTH-1 严格 userId 正则：3-32 字符，小写字母/数字开头，后续允许 -/_
SAFE_USERID_REGEX = re.compile(r"^[a-z0-9][a-z0-9_-]{2,31}$")

# R-AUTH-1 系统保留名黑名单（防冒名顶替 + 防止占位）
# 与 NestJS RESERVED_USER_IDS 完全一致（先 toLowerCase 再比较）
RESERVED_USER_IDS: set[str] = {
    # 系统路径
    "admin", "api", "system", "root", "superuser", "sys",
    # 程序关键字
    "null", "undefined", "true", "false", "none", "nil", "nan",
    # 公开占位
    "demo", "test", "guest", "anonymous", "public", "default",
    # 角色
    "support", "staff", "mod", "moderator", "operator", "service",
    # 平台名
    "mavis", "interview-agent", "interview", "agent",
    # 其他
    "me", "self", "login", "logout", "register", "signup", "auth",
}

ALGORITHM = "HS256"


class AuthError(Exception):
    """鉴权失败（401 语义）。"""


class InvalidUserIdError(Exception):
    """userId 格式非法（400 语义）。"""


class UserIdConflictError(Exception):
    """userId 已被占用（409 语义）。"""


def validate_user_id(user_id: str) -> None:
    """R-AUTH-1 校验 userId 格式 + 保留名。

    与 NestJS AuthService.validateUserId 1:1 对齐。
    """
    if not user_id or not isinstance(user_id, str):
        raise InvalidUserIdError("userId 不能为空")
    if not SAFE_USERID_REGEX.match(user_id):
        raise InvalidUserIdError(
            "userId 必须 3-32 字符，小写字母/数字开头，后续字符允许小写字母/数字/-/_"
        )
    if user_id.lower() in RESERVED_USER_IDS:
        raise InvalidUserIdError(f'"{user_id}" 是系统保留名，请换一个')


def _parse_expires_in(expires_in: str) -> timedelta:
    """解析 '7d' / '24h' / '60m' / '3600s' → timedelta。

    与 NestJS @nestjs/jwt 行为对齐：支持 d/h/m/s 后缀。
    """
    s = expires_in.strip()
    if s.endswith("d"):
        return timedelta(days=int(s[:-1]))
    if s.endswith("h"):
        return timedelta(hours=int(s[:-1]))
    if s.endswith("m"):
        return timedelta(minutes=int(s[:-1]))
    if s.endswith("s"):
        return timedelta(seconds=int(s[:-1]))
    try:
        return timedelta(seconds=int(s))
    except ValueError:
        return timedelta(days=7)


async def _upsert_user(session: "AsyncSession", user_id: str, email: str) -> User:
    """upsert User by id（demo 阶段 userId 即 user 主键）。

    与 NestJS prisma.user.upsert 等价：
    - 已存在 → 更新 email/name
    - 不存在 → 创建（id + email + name = userId）

    冲突处理：email 字段 unique 约束
    """
    existing = await session.execute(select(User).where(User.id == user_id))
    user = existing.scalar_one_or_none()
    if user is None:
        user = User(id=user_id, email=email, name=user_id)
        session.add(user)
    else:
        # 保留 user.name（用户可能改过），只更新 email
        user.email = email
    await session.commit()
    await session.refresh(user)
    return user


async def register(user_id: str, session: "AsyncSession", email: str | None = None) -> dict:
    """R-AUTH-1 注册新 ID：检查格式 + 保留名 + 是否已占用 → 创建 User。

    与 NestJS AuthService.register 1:1 对齐。
    已存在 → 抛 UserIdConflictError（controller 转 409）。
    """
    validate_user_id(user_id)
    lower_id = user_id.lower()
    # R-AUTH-7 fix (2026-06-29): email 后缀统一为 @demo.local（与 NestJS / lifecycle 一致）
    # 旧实现用 @local → 写入后 lifecycle 用 @demo.local 查不到 → list/stats/empty-rooms 返回空
    final_email = email or f"{lower_id}@demo.local"

    # 检查是否已存在
    existing = await session.execute(select(User).where(User.id == lower_id))
    if existing.scalar_one_or_none() is not None:
        raise UserIdConflictError(f'ID "{user_id}" 已被占用')

    user = User(id=lower_id, email=final_email, name=user_id)
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return {
        "userId": user.id,
        "email": user.email,
        "name": user.name,
        "created": True,
    }


async def check_availability(user_id: str, session: "AsyncSession") -> dict:
    """R-AUTH-1 检查 ID 可用性（前端实时校验）。

    永远返回结构化结果，不抛 4xx：
    - 格式不合法 → {available: false, reason: "..."}
    - 保留名 → {available: false, reason: "..."}
    - 已存在 → {available: false, reason: "该 ID 已被占用"}
    - 可用 → {available: true}
    """
    try:
        validate_user_id(user_id)
    except InvalidUserIdError as e:
        return {"userId": user_id, "available": False, "reason": str(e)}
    lower_id = user_id.lower()
    existing = await session.execute(select(User).where(User.id == lower_id))
    if existing.scalar_one_or_none() is not None:
        return {"userId": user_id, "available": False, "reason": "该 ID 已被占用"}
    return {"userId": user_id, "available": True}


async def login(user_id: str, session: "AsyncSession", email: str | None = None) -> dict:
    """demo 登录：userId 传进来即生成 token（自动 upsert user）。

    R-AUTH-1 改进：登录时自动 upsert User（保证 DB 里永远有 user 记录）
    - 已存在 user → 更新 email
    - 不存在 user → create（与 register 行为对齐，但 login 不要求"新"ID）
    """
    validate_user_id(user_id)
    lower_id = user_id.lower()
    # R-AUTH-7 fix (2026-06-29): email 后缀统一为 @demo.local（与 NestJS / lifecycle 一致）
    # 旧实现用 @local → 写入后 lifecycle 用 @demo.local 查不到 → list/stats/empty-rooms 返回空
    final_email = email or f"{lower_id}@demo.local"

    # 自动 upsert user
    user = await _upsert_user(session, lower_id, final_email)

    exp = datetime.now(timezone.utc) + _parse_expires_in(settings.JWT_EXPIRES_IN)
    payload = {
        "sub": lower_id,
        "email": user.email,
        "exp": exp,
    }

    access_token = jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=ALGORITHM,
    )

    return {
        "accessToken": access_token,
        "tokenType": "Bearer",
        "expiresIn": settings.JWT_EXPIRES_IN,
        "userId": user.id,
        "email": user.email,
        "name": user.name,
    }


def verify_token(token: str) -> dict:
    """验证 token 并返回 payload。

    锁定 algorithms=['HS256']：防 alg=none / RS256 绕过
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[ALGORITHM],
        )
        return payload
    except InvalidTokenError as e:
        raise AuthError(f"Invalid token: {e}") from e
