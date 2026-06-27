"""Interview Lifecycle Controller — 与 NestJS interview-lifecycle.controller.ts 像素级对齐。

补全 8 个 endpoint：
- GET  /api/interview/stats?userId=...      — token 统计
- GET  /api/interview/list?userId=...      — 面试列表
- GET  /api/interview/empty-rooms?userId=...&idleMinutes=30 — 空房间清理提示
- POST /api/interview/:id/confirm-resume   — 简历确认
- GET  /api/interview/:id/checkpoint       — LangGraph checkpoint
- DELETE /api/interview/:id?userId=...     — 删除面试
- GET  /api/interview/memories/:userId     — 长期记忆
- GET  /api/interview/:id                  — 详情

以及 Metrics Controller：
- POST /api/metrics/vitals                 — Web Vitals 上报

注意：FastAPI 按 router 注册顺序匹配路由，静态路由必须在前。
"""
import logging
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interview_agent.infra.db import SessionDep
from interview_agent.infra.models import Interview, InterviewStatus, Message, Report, User
from interview_agent.modules.interview.rag_service import ResumeRAGService

logger = logging.getLogger(__name__)

# 注意：这个 router 在 main.py 里需要在动态 :id 路由之前注册
lifecycle_router = APIRouter(prefix="/interview", tags=["interview-lifecycle"])


# ============================================================
# 静态路由（必须在 :id 之前）
# ============================================================


@lifecycle_router.get("/stats")
async def interview_stats(
    userId: str | None = Query(default=None),
    session: SessionDep = None,
) -> dict:
    """Token 统计：总 token / prompt / completion / 面试数 / 完成数。

    行为对齐 NestJS：
    - userId 找对应 user
    - 找不到则 fallback 到所有 demo-user-* 前缀用户的总数据
    - 聚合所有 interview 的 messages token
    """
    where_clause = None
    if userId:
        # NestJS 端用 email = "{userId}@demo.local" 查 user
        user_email = f"{userId}@demo.local"
        result = await session.execute(select(User).where(User.email == user_email))
        user = result.scalar_one_or_none()
        if user:
            from sqlalchemy import select as sa_select
            stmt = sa_select(Interview).where(Interview.user_id == user.id)
            interviews_result = await session.execute(stmt)
            interviews = list(interviews_result.scalars().all())
        else:
            # fallback: demo-user-* 前缀
            demo_result = await session.execute(
                select(User).where(User.email.like("demo-user-%"))
            )
            demo_users = demo_result.scalars().all()
            demo_ids = [u.id for u in demo_users]
            interviews_result = await session.execute(
                select(Interview).where(Interview.user_id.in_(demo_ids))
            )
            interviews = list(interviews_result.scalars().all())
    else:
        interviews_result = await session.execute(select(Interview))
        interviews = list(interviews_result.scalars().all())

    # 聚合 tokens
    total_prompt = 0
    total_completion = 0
    for iv in interviews:
        msgs_result = await session.execute(
            select(Message).where(Message.interview_id == iv.id)
        )
        for m in msgs_result.scalars():
            total_prompt += m.prompt_tokens or 0
            total_completion += m.completion_tokens or 0

    return {
        "totalTokens": total_prompt + total_completion,
        "totalPrompt": total_prompt,
        "totalCompletion": total_completion,
        "totalInterviews": len(interviews),
        "completedInterviews": sum(1 for i in interviews if i.status == InterviewStatus.COMPLETED),
    }


@lifecycle_router.get("/list")
async def interview_list(
    userId: str = Query(...),
    session: SessionDep = None,
) -> list:
    """面试列表：按 userId 查 → interview + report + messages + display 信息。

    行为对齐 NestJS：user 通过 email={userId}@demo.local 查。
    """
    if not userId:
        return []
    user_email = f"{userId}@demo.local"
    result = await session.execute(select(User).where(User.email == user_email))
    user = result.scalar_one_or_none()
    if not user:
        return []

    interviews_result = await session.execute(
        select(Interview)
        .where(Interview.user_id == user.id)
        .order_by(Interview.started_at.desc())
    )
    interviews = list(interviews_result.scalars().all())

    # ResumeRAG 查最新简历
    resume_svc = ResumeRAGService()
    try:
        resumes = await resume_svc.search_by_user(userId, limit=1)
    except Exception:
        resumes = []
    latest = resumes[0] if resumes else None

    out: list[dict] = []
    for iv in interviews:
        report_result = await session.execute(
            select(Report).where(Report.interview_id == iv.id)
        )
        report = report_result.scalar_one_or_none()
        msgs_result = await session.execute(
            select(Message).where(Message.interview_id == iv.id).order_by(Message.created_at.asc())
        )
        msgs = list(msgs_result.scalars())

        out.append({
            "id": iv.id,
            "userId": iv.user_id,
            "position": iv.position,
            "level": iv.level,
            "status": iv.status.value if iv.status else None,
            "startedAt": iv.started_at.isoformat() if iv.started_at else None,
            "endedAt": iv.ended_at.isoformat() if iv.ended_at else None,
            "summary": iv.summary,
            "resumeConfirmed": iv.resume_confirmed,
            "messages": [
                {
                    "id": m.id, "role": m.role, "content": m.content,
                    "promptTokens": m.prompt_tokens or 0,
                    "completionTokens": m.completion_tokens or 0,
                    "createdAt": m.created_at.isoformat() if m.created_at else None,
                }
                for m in msgs
            ],
            "report": {
                "id": report.id, "interviewId": report.interview_id,
                "overallScore": report.overall_score, "scores": report.scores,
                "strengths": report.strengths, "weaknesses": report.weaknesses,
                "suggestions": report.suggestions, "createdAt": report.created_at.isoformat(),
            } if report else None,
            "display": {
                "resumeName": (latest or {}).get("name"),
                "summary": (latest or {}).get("summary"),
                "position": iv.position,
                "level": iv.level,
                "startedAt": iv.started_at.isoformat() if iv.started_at else None,
                "status": iv.status.value if iv.status else None,
                "reportScore": report.overall_score if report else None,
            },
        })
    return out


@lifecycle_router.get("/empty-rooms")
async def empty_rooms(
    userId: str = Query(...),
    idleMinutes: str | None = Query(default=None),
    session: SessionDep = None,
) -> dict:
    """列出「30 分钟前开始 + 0 条消息 + IN_PROGRESS」的面试，前端首页会弹窗让用户清理。

    对齐 NestJS：user 查不到时直接返空（不抛错）。
    """
    if not userId:
        return {"userId": userId, "emptyRooms": [], "count": 0}
    user_email = f"{userId}@demo.local"
    result = await session.execute(select(User).where(User.email == user_email))
    user = result.scalar_one_or_none()
    if not user:
        return {"userId": userId, "emptyRooms": [], "count": 0}

    minutes = int(idleMinutes) if idleMinutes else 30
    threshold = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=minutes)

    # 找出：status=IN_PROGRESS + 0 条消息 + startedAt < threshold
    result = await session.execute(
        select(Interview)
        .where(
            Interview.user_id == user.id,
            Interview.status == InterviewStatus.IN_PROGRESS,
            Interview.started_at < threshold,
        )
        .order_by(Interview.started_at.desc())
    )
    candidates = list(result.scalars().all())

    # 过滤 0 条消息
    empty: list[dict] = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for c in candidates:
        msgs_count_result = await session.execute(
            select(Message).where(Message.interview_id == c.id).limit(1)
        )
        if msgs_count_result.scalar_one_or_none() is None:
            empty.append({
                "id": c.id,
                "position": c.position,
                "level": c.level,
                "startedAt": c.started_at.isoformat(),
                "idleMinutes": int((now - c.started_at).total_seconds() / 60),
            })

    return {"userId": userId, "idleMinutes": minutes, "emptyRooms": empty, "count": len(empty)}


@lifecycle_router.get("/memories/{user_id}")
async def get_memories(user_id: str, session: SessionDep) -> dict:
    """长期记忆召回（与 NestJS getMemories 对齐）。"""
    from interview_agent.modules.memory.memory import l3_read
    # user 查不到 → 空
    user_result = await session.execute(select(User).where(User.email == f"{user_id}@demo.local"))
    user = user_result.scalar_one_or_none()
    if not user:
        return {"userId": user_id, "memories": [], "count": 0}
    memories = await l3_read(user.id, key=None) or {}
    mem_list = memories if isinstance(memories, list) else list(memories.values())
    return {"userId": user_id, "memories": mem_list, "count": len(mem_list)}


# ============================================================
# 动态路由 :id
# ============================================================


@lifecycle_router.get("/{interview_id}")
async def get_interview(interview_id: str, session: SessionDep) -> dict | None:
    """面试详情（含 messages + report + resume）。

    行为对齐 NestJS：
    - IN_PROGRESS 时 report 字段置 null（前端正确显示聊天界面）
    - COMPLETED 时 report 返回
    """
    result = await session.execute(select(Interview).where(Interview.id == interview_id))
    iv = result.scalar_one_or_none()
    if not iv:
        return None

    msgs_result = await session.execute(
        select(Message).where(Message.interview_id == interview_id).order_by(Message.created_at.asc())
    )
    msgs = list(msgs_result.scalars())

    report_result = await session.execute(
        select(Report).where(Report.interview_id == interview_id)
    )
    report = report_result.scalar_one_or_none()

    user_result = await session.execute(select(User).where(User.id == iv.user_id))
    user = user_result.scalar_one_or_none()
    demo_user_id = user.email.replace("@demo.local", "") if user and user.email else iv.user_id

    # ResumeRAG 查最新简历
    resume_svc = ResumeRAGService()
    try:
        resumes = await resume_svc.search_by_user(demo_user_id, limit=1)
    except Exception:
        resumes = []
    latest = resumes[0] if resumes else None

    is_completed = iv.status == InterviewStatus.COMPLETED

    return {
        "id": iv.id,
        "userId": iv.user_id,
        "position": iv.position,
        "level": iv.level,
        "status": iv.status.value,
        "startedAt": iv.started_at.isoformat(),
        "endedAt": iv.ended_at.isoformat() if iv.ended_at else None,
        "summary": iv.summary,
        "resumeConfirmed": iv.resume_confirmed,
        "messages": [
            {
                "id": m.id, "role": m.role, "content": m.content,
                "promptTokens": m.prompt_tokens or 0,
                "completionTokens": m.completion_tokens or 0,
                "createdAt": m.created_at.isoformat() if m.created_at else None,
            }
            for m in msgs
        ],
        "resume": {
            "name": (latest or {}).get("name"),
            "position": (latest or {}).get("position"),
            "summary": (latest or {}).get("summary"),
            "skills": (latest or {}).get("skills"),
            "createdAt": (latest or {}).get("createdAt"),
        } if latest else None,
        # IN_PROGRESS 时 report 字段置 null
        "report": {
            "id": report.id, "interviewId": report.interview_id,
            "overallScore": report.overall_score, "scores": report.scores,
            "strengths": report.strengths, "weaknesses": report.weaknesses,
            "suggestions": report.suggestions, "createdAt": report.created_at.isoformat(),
        } if is_completed and report else None,
    }


@lifecycle_router.post("/{interview_id}/confirm-resume")
async def confirm_resume(interview_id: str, session: SessionDep) -> dict:
    """简历确认 → resumeConfirmed=true。"""
    result = await session.execute(select(Interview).where(Interview.id == interview_id))
    iv = result.scalar_one_or_none()
    if not iv:
        return {"success": False, "reason": "not_found"}
    iv.resume_confirmed = True
    await session.commit()
    logger.info(f"Resume confirmed for interview {interview_id}")
    return {"success": True}


@lifecycle_router.get("/{interview_id}/checkpoint")
async def get_checkpoint(interview_id: str) -> dict:
    """LangGraph checkpoint 查询（简化版：Python 端未启 langgraph 包，返回 disabled）。

    NestJS 端返回完整 state + checkpoints；Python 端用纯 Python state machine，
    这里返回 mock 但保持 schema 兼容。
    """
    return {
        "enabled": False,
        "threadId": interview_id,
        "hasState": False,
        "checkpointCount": 0,
        "recentCheckpoints": [],
        "stateSnapshot": None,
        "message": "Python backend uses pure-Python state machine; checkpoints not persisted to PostgresSaver",
    }


@lifecycle_router.delete("/{interview_id}")
async def delete_interview(
    interview_id: str,
    userId: str | None = Query(default=None),
    session: SessionDep = None,
) -> dict:
    """删除面试。

    行为对齐 NestJS：
    - userId 必填 → 不填返 forbidden（防任意人删任意 interview）
    - user 查不到 → forbidden（不留查不到就不校验的口子）
    - interview 不存在 → not_found
    - 归属校验失败 → forbidden
    """
    if not userId:
        return {"deleted": False, "reason": "forbidden", "message": "userId required"}

    result = await session.execute(select(Interview).where(Interview.id == interview_id))
    iv = result.scalar_one_or_none()
    if not iv:
        return {"deleted": False, "reason": "not_found"}

    user_result = await session.execute(select(User).where(User.email == f"{userId}@demo.local"))
    user = user_result.scalar_one_or_none()
    if not user or iv.user_id != user.id:
        return {"deleted": False, "reason": "forbidden"}

    await session.delete(iv)
    await session.commit()
    logger.info(f"Deleted interview {interview_id} (manual cleanup)")
    return {"deleted": True, "reason": "manual_cleanup"}


# ============================================================
# Metrics Controller — 与 NestJS metrics.controller.ts 对齐
# ============================================================

metrics_router = APIRouter(prefix="/metrics", tags=["metrics"])


class VitalMetric(BaseModel):
    name: str
    value: float
    rating: str
    delta: float = 0
    navigationType: str = ""
    url: str = ""
    timestamp: int = 0


class VitalsReport(BaseModel):
    vitals: list[VitalMetric] = []


@metrics_router.post("/vitals")
async def report_vitals(body: VitalsReport) -> dict:
    """Web Vitals 上报（前端 web-vitals.ts 调用）。

    对齐 NestJS MetricsController：
    - 空 vitals → {ok: true}
    - 非空 → log 每条 + {ok: true, count}
    """
    if not body.vitals:
        return {"ok": True}
    for m in body.vitals:
        logger.info(
            f"[WebVitals] {m.name}={m.value:.1f}ms ({m.rating}) "
            f"nav={m.navigationType} url={m.url}"
        )
    return {"ok": True, "count": len(body.vitals)}


# timedelta 需要 import
from datetime import timedelta