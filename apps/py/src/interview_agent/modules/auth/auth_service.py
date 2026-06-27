"""JWT 签发 / 校验 — 与 NestJS AuthService 像素级等价。

关键安全细节（必须 1:1 翻译）：
- demo 简化：userId 传进来即登录（不做密码验证）
- userId 格式校验：^[a-zA-Z0-9_-]{2,50}$
- JWT 算法锁定 HS256（防 algorithm confusion attack：攻击者改 alg=none / RS256）
- payload: { sub: userId, email, exp }

注意：PyJWT 2.x 没有 `expires_in` kwarg，过期时间通过 payload['exp'] 字段设置。
NestJS @nestjs/jwt 内部也是这个机制（自动把 expiresIn 转 exp）。
"""
import re
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import InvalidTokenError

from interview_agent.config import settings

SAFE_USERID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{2,50}$")

ALGORITHM = "HS256"


class AuthError(Exception):
    """鉴权失败（401 语义）。"""


class InvalidUserIdError(Exception):
    """userId 格式非法（400 语义）。"""


def _validate_user_id(user_id: str) -> None:
    """对齐 NestJS SAFE_USERID_REGEX 校验。"""
    if not user_id or not isinstance(user_id, str) or not SAFE_USERID_REGEX.match(user_id):
        raise InvalidUserIdError("userId must be 2-50 chars of [a-zA-Z0-9_-]")


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
    # 默认按秒处理（NestJS 同 fallback）
    try:
        return timedelta(seconds=int(s))
    except ValueError:
        return timedelta(days=7)  # 与 default '7d' 一致


async def login(user_id: str, email: str | None = None) -> dict:
    """demo 登录：userId 传进来即生成 token。"""
    _validate_user_id(user_id)

    exp = datetime.now(timezone.utc) + _parse_expires_in(settings.JWT_EXPIRES_IN)
    payload = {
        "sub": user_id,
        "email": email or f"{user_id}@local",
        "exp": exp,
    }

    # 锁定 HS256（防 algorithm confusion）
    access_token = jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=ALGORITHM,
    )

    return {
        "accessToken": access_token,
        "tokenType": "Bearer",
        "expiresIn": settings.JWT_EXPIRES_IN,
        "userId": user_id,
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