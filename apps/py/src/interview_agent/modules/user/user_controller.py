"""User module — 与 NestJS UserModule 像素级对齐。

路由：
- POST /user — upsert by email
- GET /user/:id — find user by id
- GET /user/:id/interviews — list user's interviews (按 startedAt desc, 含 report)

UserModule 在 NestJS 中极简：只有 UserController，没 Service，所有逻辑直连 PrismaService。
Python 端也保持简洁：直接 AsyncSession。
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interview_agent.infra.db import SessionDep
from interview_agent.infra.models import Interview, User
from interview_agent.modules.auth.jwt_guard import CurrentUserDep

router = APIRouter(tags=["user"])


class CreateUserRequest(BaseModel):
    email: EmailStr
    name: str | None = None


@router.post("")
async def create_user(
    req: CreateUserRequest,
    session: SessionDep,
) -> dict:
    """upsert by email — NestJS PrismaService.user.upsert 等价。

    注意：NestJS 不用 email-validator（只是 str），但 Python Pydantic EmailStr 更严格。
    与前端契约一致（前端传合法 email 才能通过），边界等价。
    """
    existing = await session.execute(select(User).where(User.email == req.email))
    user = existing.scalar_one_or_none()

    if user:
        # update
        user.name = req.name
        await session.commit()
        await session.refresh(user)
    else:
        # create with cuid-like id（NestJS 用 Prisma @default(cuid())）
        import secrets
        user = User(
            id=f"c{secrets.token_hex(12)}",
            email=req.email,
            name=req.name,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatarUrl": user.avatar_url,
        "createdAt": user.created_at.isoformat(),
        "updatedAt": user.updated_at.isoformat(),
    }


@router.get("/{user_id}")
async def get_user(user_id: str, session: SessionDep) -> dict:
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatarUrl": user.avatar_url,
        "createdAt": user.created_at.isoformat(),
        "updatedAt": user.updated_at.isoformat(),
    }


@router.get("/{user_id}/interviews")
async def get_user_interviews(user_id: str, session: SessionDep) -> list[dict]:
    """对齐 NestJS getUserInterviews：orderBy startedAt desc + include report.

    注：NestJS include report 自动展开为 { ..., report: {...} }。
    Python 端我们也用 report 字段（None 时省略）。
    """
    result = await session.execute(
        select(Interview)
        .where(Interview.user_id == user_id)
        .order_by(Interview.started_at.desc())
    )
    interviews = result.scalars().all()

    return [
        {
            "id": i.id,
            "userId": i.user_id,
            "position": i.position,
            "level": i.level,
            "status": i.status.value,
            "startedAt": i.started_at.isoformat(),
            "endedAt": i.ended_at.isoformat() if i.ended_at else None,
            "summary": i.summary,
            "resumeConfirmed": i.resume_confirmed,
            "report": (
                {
                    "id": i.report.id,
                    "interviewId": i.report.interview_id,
                    "overallScore": i.report.overall_score,
                    "scores": i.report.scores,
                    "strengths": i.report.strengths,
                    "weaknesses": i.report.weaknesses,
                    "suggestions": i.report.suggestions,
                    "createdAt": i.report.created_at.isoformat(),
                }
                if i.report
                else None
            ),
        }
        for i in interviews
    ]