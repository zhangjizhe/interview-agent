"""JWT Auth Guard — 与 NestJS JwtAuthGuard 像素级等价。

行为对齐：
- 提取 Authorization: Bearer <token>
- demo 模式（NODE_ENV=development）无 token → 注入 mock user { userId: 'demo-user', email: 'demo@local' }
- 生产模式无 token → 401
- token 无效 → 401
- 解出 payload → request.state.user = { userId, email }
"""
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from interview_agent.config import settings
from interview_agent.modules.auth import auth_service

# auto_error=False：手动处理 401（与 NestJS CanActivate 行为一致）
_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> dict:
    """FastAPI Depends：从请求头提取 + 验证 JWT，返回 user dict。

    返回：
    ```python
    { "userId": str, "email": str }
    ```

    demo 模式无 token：注入 mock user，与 NestJS JwtAuthGuard 一致
    """
    token = credentials.credentials if credentials else None

    if not token:
        # demo 阶段允许无 token 访问（生产环境改成 401）
        is_demo = settings.NODE_ENV == "development"
        if is_demo:
            return {"userId": "demo-user", "email": "demo@local"}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )

    try:
        payload = auth_service.verify_token(token)
    except auth_service.AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        ) from e

    return {
        "userId": payload.get("sub") or payload.get("userId"),
        "email": payload.get("email"),
    }


CurrentUserDep = Annotated[dict, Depends(get_current_user)]