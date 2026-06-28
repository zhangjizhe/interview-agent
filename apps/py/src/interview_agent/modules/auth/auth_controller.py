"""Auth Controller — 与 NestJS AuthController 像素级对齐。

路由：
- POST /auth/register — 注册新 ID（已存在 → 409）
- GET  /auth/check/:userId — 检查 ID 可用性（前端实时校验）
- POST /auth/login — demo 登录，userId 传进来即生成 token（自动 upsert user）
- GET  /auth/profile — 获取当前用户信息（需 JWT）

R-AUTH-1 登录页面化（2026-06-28）：
- /register 与 /login 区别：
  - /login: 任何合规 userId 都能拿到 token（demo 临时登录 + 已存在 user 自动 upsert）
  - /register: 严格要求 ID 不存在（创建新身份流程）

注意：
- AuthController 在 NestJS 中挂在 /auth 前缀，controller-level @Controller('auth')
- Python 端在 main.py 用 prefix='/api/auth' 挂载（与 setGlobalPrefix('api') 对齐）
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from interview_agent.infra.db import SessionDep
from interview_agent.modules.auth import auth_service
from interview_agent.modules.auth.jwt_guard import CurrentUserDep

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    userId: str = Field(..., min_length=2, max_length=50)
    email: str | None = None


@router.post("/register")
async def register(req: LoginRequest, session: SessionDep) -> dict:
    """R-AUTH-1 注册新 ID。

    返回字段与 NestJS RegisterResult 1:1：
    ```json
    { "userId", "email", "name", "created": true }
    ```
    """
    try:
        return await auth_service.register(req.userId, session, req.email)
    except auth_service.InvalidUserIdError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    except auth_service.UserIdConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from e


@router.get("/check/{user_id}")
async def check_availability(user_id: str, session: SessionDep) -> dict:
    """R-AUTH-1 检查 ID 可用性（前端实时校验）。

    永远返回 200 + 结构化结果（前端用 reason 显示错误原因）：
    ```json
    { "userId": "...", "available": bool, "reason"?: "..." }
    ```
    """
    return await auth_service.check_availability(user_id, session)


@router.post("/login")
async def login(req: LoginRequest, session: SessionDep) -> dict:
    """demo 登录：userId 传进来即生成 token（自动 upsert user）。

    返回字段与 NestJS LoginResult 1:1：
    ```json
    { "accessToken", "tokenType", "expiresIn", "userId", "email", "name" }
    ```
    """
    try:
        return await auth_service.login(req.userId, session, req.email)
    except auth_service.InvalidUserIdError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.get("/profile")
async def profile(current_user: CurrentUserDep) -> dict:
    """获取当前登录用户信息（需要 JWT token）。"""
    return {
        "userId": current_user["userId"],
        "email": current_user["email"],
    }
