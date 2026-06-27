"""Auth Controller — 与 NestJS AuthController 像素级对齐。

路由：
- POST /auth/login — demo 登录，userId 传进来即生成 token
- GET /auth/profile — 获取当前用户信息（需 JWT）

注意：
- AuthController 在 NestJS 中挂在 /auth 前缀，controller-level @Controller('auth')
- Python 端在 main.py 用 prefix='/api/auth' 挂载（与 setGlobalPrefix('api') 对齐）
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from interview_agent.config import settings
from interview_agent.modules.auth import auth_service
from interview_agent.modules.auth.jwt_guard import CurrentUserDep

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    userId: str = Field(..., min_length=2, max_length=50)
    email: str | None = None


@router.post("/login")
async def login(req: LoginRequest) -> dict:
    """demo 简化：userId 传进来即生成 token（不需要密码）。

    返回字段与 NestJS LoginResult 1:1：
    ```json
    { "accessToken", "tokenType", "expiresIn", "userId" }
    ```
    """
    try:
        return await auth_service.login(req.userId, req.email)
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