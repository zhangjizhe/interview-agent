"""Auth 路由（JWT，对齐 NestJS AuthModule）"""
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt

router = APIRouter()


class LoginRequest(BaseModel):
    email: str = "anonymous@local"
    password: str = ""


class TokenResponse(BaseModel):
    accessToken: str
    tokenType: str = "Bearer"
    expiresIn: str = "7d"


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    """简化版登录（开发期）：发 JWT"""
    from app.config import settings

    expires = datetime.utcnow() + timedelta(days=7)
    payload = {
        "email": req.email,
        "iat": int(datetime.utcnow().timestamp()),
        "exp": int(expires.timestamp()),
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    return TokenResponse(accessToken=token)