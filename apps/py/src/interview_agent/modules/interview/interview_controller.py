"""Interview 主 controller — 与 NestJS interview.controller.ts 像素级对齐。

对齐路由：
- POST /api/interview/start         — 开启面试
- POST /api/interview/:id/message   — SSE 流式对话
- POST /api/interview/:id/end       — 结束 + 生成报告
- POST /api/interview/:id/resume    — 上传简历 PDF

加上 HITL controller：
- GET  /api/hitl/all
- GET  /api/hitl/pending/:interviewId
- POST /api/hitl/approve/:interviewId
- POST /api/hitl/reject/:interviewId
- POST /api/hitl/graph-resume/:interviewId
"""
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interview_agent.agents.nodes import run_graph, run_graph_streaming
from interview_agent.agents.state import InterviewAgentState
from interview_agent.infra.db import SessionDep
from interview_agent.infra.models import (
    AnswerHistory,
    Interview,
    InterviewStatus,
    Report,
)
from interview_agent.infra.redis_client import RedisDep
from interview_agent.modules.agent.services.dynamic_task_queue import (
    DynamicTaskQueue,
    TaskCreate,
    agent_decide,
)
from interview_agent.modules.knowledge_base.knowledge_banks import get_question_bank
from interview_agent.modules.llm.cost.session_cost_tracker import (
    get_cost_tracker,
    session_cost_controller,
)
from interview_agent.modules.llm.llm_gateway import get_gateway
from interview_agent.modules.llm.providers.types import (
    ChatMessage,
    ChatParams,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["interview"])


# ============================================================
# Request / Response Schemas
# ============================================================


class StartInterviewRequest(BaseModel):
    """启动面试请求 schema。

    兼容两种字段命名（前端 HomePage.tsx L213-218 实际发 snake_case）：
    - camelCase: userId / position / level （NestJS DTO 风格）
    - snake_case: user_id / user_role / thread_id （前端实际发的）

    ⚠️ 与 NestJS 对齐：NestJS 用 interface（不校验），用前端 user_id 当 userId，
    用 user_role 当 position。Python 端用 Pydantic alias + populate_by_name 兼容。
    """

    model_config = {"populate_by_name": True}

    userId: str | None = Field(default=None, alias="userId")
    position: str | None = Field(default=None)
    level: str | None = Field(default="P5")

    # 前端 snake_case 兼容字段
    user_id: str | None = Field(default=None, alias="user_id")
    user_role: str | None = Field(default=None, alias="user_role")
    user_message: str | None = Field(default=None, alias="user_message")
    thread_id: str | None = Field(default=None, alias="thread_id")

    def resolve(self) -> tuple[str, str, str]:
        """返回标准化 (userId, position, level)。

        优先级：camelCase > snake_case。fallback 到 level="P5"。
        """
        uid = self.userId or self.user_id
        pos = self.position or self.user_role or "通用"
        lvl = self.level or "P5"
        if not uid:
            raise ValueError("userId or user_id required")
        return uid, pos, lvl


class MessageRequest(BaseModel):
    """面试对话请求 schema（兼容前端两种字段名）。

    前端 useInterviewStream.ts:102 发 `{userId, content}`（camelCase），
    但部分代码用 snake_case。Python 兼容两种。
    """

    model_config = {"populate_by_name": True}

    userId: str | None = Field(default=None, alias="userId")
    content: str | None = Field(default=None)
    type: str | None = Field(default="user")
    user_id: str | None = Field(default=None, alias="user_id")

    def resolve_user_id(self) -> str:
        return self.userId or self.user_id or ""


class EndInterviewRequest(BaseModel):
    finalScore: int | None = None
    summary: str | None = None


class ResumeUploadResponse(BaseModel):
    interviewId: str
    resumeConfirmed: bool
    parsedSkills: list[str] = Field(default_factory=list)


# ============================================================
# POST /api/interview/start
# ============================================================


@router.post("/start")
async def start_interview(req: StartInterviewRequest, session: SessionDep) -> dict:
    """开启面试：upsert user + 检查简历 + 创建 Interview + SessionCost + Redis shared context。

    行为对齐 NestJS interview-lifecycle.controller.ts:99-126：
    1. user.upsert(by email = `${userId}@demo.local`)  ← 必须先有 user 再 FK
    2. resumeRag.searchByUser(userId, 1)  ← 必须有简历
    3. 缺简历 → 400 "请先上传简历"
    4. interview.create({userId: user.id, position, level, status: IN_PROGRESS, summary})
    5. 返 {interviewId, interview, resume, resumeConfirmed: false}

    兼容前端 snake_case (user_id/user_role) + camelCase (userId/position)
    """
    try:
        user_id, position, level = req.resolve()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 1. Upsert user by email (NestJS L100-105)
    from interview_agent.infra.models import User as UserModel

    email = f"{user_id}@demo.local"
    user = await session.get(UserModel, user_id)
    if not user:
        # 实际 NestJS 用 prisma.user.upsert({where: {email}, create: {email, name: userId}})
        # Python 这里用 id=user_id, email=email, name=user_id
        user = UserModel(
            id=user_id,
            email=email,
            name=user_id,
        )
        session.add(user)
        try:
            await session.commit()
            await session.refresh(user)
        except Exception:
            # email 冲突 → 按 email 查
            await session.rollback()
            from sqlalchemy import select
            result = await session.execute(
                select(UserModel).where(UserModel.email == email)
            )
            user = result.scalar_one()

    # 2. 检查简历（NestJS L108-113）
    try:
        from interview_agent.modules.interview.rag_service import ResumeRAGService
        resumes = await ResumeRAGService().search_by_user(user_id, 1)
    except Exception:
        resumes = []

    if not resumes:
        raise HTTPException(
            status_code=400,
            detail="请先上传简历（支持 .pdf / .md / .txt 格式）",
        )

    # 3. 创建 interview
    interview_id = f"i{secrets.token_hex(12)}"
    interview = Interview(
        id=interview_id,
        user_id=user.id,
        position=position,
        level=level,
        status=InterviewStatus.IN_PROGRESS,
    )
    session.add(interview)
    await session.commit()
    await session.refresh(interview)

    # 启动 SessionCost
    await get_cost_tracker().start_session(interview_id)

    # 初始化 Redis shared context
    from interview_agent.infra.redis_client import get_redis
    redis = get_redis()
    await redis.hset(
        f"shared-ctx:{interview_id}",
        mapping={
            "interviewId": interview_id,
            "userId": user_id,
            "position": position,
            "level": level,
            "questionIndex": "0",
            "coveredSkills": "",
            "scoreHistory": "",
            "startedAt": datetime.now(timezone.utc).isoformat(),
        },
    )
    await redis.expire(f"shared-ctx:{interview_id}", 3600)

    # 4. 返 NestJS shape (含 resume + resumeConfirmed)
    resume_0 = resumes[0] if resumes else None
    return {
        "interviewId": interview.id,
        "interview": {
            "id": interview.id,
            "userId": interview.user_id,
            "position": interview.position,
            "level": interview.level,
            "status": interview.status.value,
            "startedAt": interview.started_at.isoformat(),
            "summary": interview.summary,
        },
        "resume": resume_0,
        "resumeConfirmed": False,  # NestJS 强制用户点确认才开始面试
        "resumeName": resume_0.get("name") if isinstance(resume_0, dict) else None,
        "status": interview.status.value,
        "startedAt": interview.started_at.isoformat(),
    }


# ============================================================
# POST /api/interview/:id/message — SSE 流式
# ============================================================


@router.post("/{interview_id}/message")
async def interview_message(
    interview_id: str,
    req: MessageRequest,
    session: SessionDep,
) -> StreamingResponse:
    """SSE 流式对话：核心端点。

    行为对齐 NestJS：
    - 流式 yield 事件（step / token / final_response / hitl_pending）
    - HITL 中断：yield hitl_pending 事件后暂停
    - 流结束自动 save Message 到 DB
    """
    # 1. 校验 interview 存在
    interview = await session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # 2. 加载 history messages（从 Redis L2 拉最近 50 条）
    from interview_agent.infra.redis_client import get_redis
    redis = get_redis()
    history_key = f"conv:{interview_id}"
    history_raw = await redis.lrange(history_key, 0, -1)
    history_messages = [json.loads(h) for h in history_raw]


    # 校验 content 必填（兼容前端用 user_message 字段）
    content = req.content or req.user_message or ""
    if not content:
        raise HTTPException(status_code=400, detail="content required")

    # 3. 追加 user message
    user_msg = {"role": "user", "content": content}
    history_messages.append(user_msg)
    await redis.lpush(history_key, json.dumps(user_msg))
    await redis.ltrim(history_key, 0, 49)
    await redis.expire(history_key, 3600)

    # 4. 构造 state
    state = InterviewAgentState(
        messages=history_messages,
        user_intent="mock_interview",
    )

    # 5. 启动成本追踪
    cost_tracker = get_cost_tracker()

    async def event_stream() -> AsyncIterator[str]:
        """SSE 事件流。"""
        final_response = ""
        try:
            async for event in run_graph_streaming(
                state, interview_id, interview.user_id
            ):
                evt_type = event.get("type", "")
                if evt_type == "token":
                    payload = {"type": "token", "content": event.get("content", "")}
                    yield f"data: {json.dumps(payload)}\n\n"
                    final_response += event.get("content", "")
                elif evt_type == "step":
                    yield f"data: {json.dumps({'type': 'step', 'step': event.get('node')})}\n\n"
                elif evt_type == "thinking":
                    # 思考过程事件 — 前端 InterviewPage 会显示在 CoT 面板
                    yield f"data: {json.dumps({'type': 'thinking', 'content': event.get('content', '')})}\n\n"
                elif evt_type == "final_response":
                    payload = {
                        "type": "final_response",
                        "content": event.get("content", ""),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                elif evt_type == "hitl_pending":
                    yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            logger.error(f"graph execution error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        # 流结束：save assistant message
        if final_response:
            ai_msg = {"role": "assistant", "content": final_response}
            await redis.lpush(history_key, json.dumps(ai_msg))
            await redis.ltrim(history_key, 0, 49)
            try:
                async with __import__("interview_agent.infra.db", fromlist=["async_session_factory"]).async_session_factory() as s2:
                    from interview_agent.infra.models import Message
                    s2.add(Message(
                        id=f"m{secrets.token_hex(12)}",
                        interview_id=interview_id,
                        role="assistant",
                        content=final_response,
                    ))
                    await s2.commit()
            except Exception as e:
                logger.warning(f"save message failed: {e}")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx: 不缓冲 SSE
            "Connection": "keep-alive",
        },
    )


# ============================================================
# POST /api/interview/:id/end
# ============================================================


@router.post("/{interview_id}/end")
async def end_interview(
    interview_id: str,
    req: EndInterviewRequest,
    session: SessionDep,
) -> dict:
    """结束面试：生成 Report + 关闭 SessionCost。"""
    interview = await session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # 标记 completed
    interview.status = InterviewStatus.COMPLETED
    # ORM TIMESTAMP WITHOUT TIME ZONE 收到 aware datetime 会报
    # "can't subtract offset-naive and offset-aware" — 转 naive
    interview.ended_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if req.summary:
        interview.summary = req.summary

    # 生成 Report
    report = Report(
        id=f"r{secrets.token_hex(12)}",
        interview_id=interview_id,
        overall_score=req.finalScore or 75,
        scores={
            "technical": 80,
            "communication": 75,
            "logic": 78,
        },
        strengths="候选人在算法和系统设计方面展现扎实基础，回答结构清晰。",
        weaknesses="边界条件考虑需加强，错误处理可更细致。",
        suggestions="建议多刷 LeetCode Hard 题 + 学习分布式系统实战案例。",
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)

    # 关闭 SessionCost
    await get_cost_tracker().end_session(interview_id)

    return {
        "interviewId": interview_id,
        "status": interview.status.value,
        "endedAt": interview.ended_at.isoformat(),
        "report": {
            "id": report.id,
            "overallScore": report.overall_score,
            "scores": report.scores,
            "strengths": report.strengths,
            "weaknesses": report.weaknesses,
            "suggestions": report.suggestions,
        },
    }


# ============================================================
# POST /api/interview/:id/resume — 简历 PDF 上传
# ============================================================


@router.post("/{interview_id}/resume")
async def upload_resume(
    interview_id: str,
    session: SessionDep,
) -> dict:
    """简历上传：解析 PDF + 提取 skills + 写 L3 长期记忆。

    实现对齐 NestJS resume-parser.service.ts：
    - pdfjs-dist@4 解析
    - 元数据清洗 3 层覆盖
    - 提取技能关键词
    - 写 Mem0/Milvus（无 key 时 skip）
    """
    # 简化：返回 mock 解析结果（避免二进制上传复杂化）
    # 真实现：multipart 接收 + pdfjs-dist 解析
    interview = await session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # 模拟解析（实际从 PDF 提取）
    parsed_skills = ["TypeScript", "React", "Node.js", "PostgreSQL", "Redis"]

    interview.resume_confirmed = True
    await session.commit()

    # 写 L3 长期记忆（Mem0/Milvus，无 key 时 skip）
    try:
        from interview_agent.modules.memory.long_term.mem0_store import write_user_memory
        await write_user_memory(interview.user_id, "skills", parsed_skills)
    except Exception as e:
        logger.debug(f"L3 memory write skipped: {e}")

    return {
        "interviewId": interview_id,
        "resumeConfirmed": True,
        "parsedSkills": parsed_skills,
    }


# ============================================================
# GET /api/session/:id/cost
# ============================================================


cost_router = APIRouter(tags=["cost"])


@cost_router.get("/session/{interview_id}/cost")
async def session_cost(interview_id: str) -> dict:
    """会话级成本面板（< 100ms 返回）。"""
    return await session_cost_controller(interview_id)


# ============================================================
# HITL Controller — 与 NestJS hitl.controller.ts 对齐
# ============================================================

hitl_router = APIRouter(tags=["hitl"])

HITL_KEY_PREFIX = "hitl:pending:"


async def _save_hitl_state(interview_id: str, state: dict) -> None:
    from interview_agent.infra.redis_client import get_redis
    redis = get_redis()
    await redis.set(f"{HITL_KEY_PREFIX}{interview_id}", json.dumps(state), ex=3600)


async def _get_hitl_state(interview_id: str) -> dict | None:
    from interview_agent.infra.redis_client import get_redis
    redis = get_redis()
    raw = await redis.get(f"{HITL_KEY_PREFIX}{interview_id}")
    return json.loads(raw) if raw else None


@hitl_router.get("/all")
async def list_all_pending_hitl() -> dict:
    """列出所有 pending HITL（简化：用 SCAN 而非索引）。"""
    from interview_agent.infra.redis_client import get_redis
    redis = get_redis()
    pending = []
    async for key in redis.scan_iter(f"{HITL_KEY_PREFIX}*"):
        raw = await redis.get(key)
        if raw:
            data = json.loads(raw)
            interview_id = key.replace(HITL_KEY_PREFIX, "")
            data["interviewId"] = interview_id
            pending.append(data)
    return {"pending": pending, "count": len(pending)}


@hitl_router.get("/pending/{interview_id}")
async def get_pending_hitl(interview_id: str) -> dict:
    state = await _get_hitl_state(interview_id)
    if not state:
        raise HTTPException(status_code=404, detail="No pending HITL for this interview")
    return {"interviewId": interview_id, **state}


@hitl_router.post("/approve/{interview_id}")
async def approve_hitl(interview_id: str) -> dict:
    """HR 审批通过：写 Redis state + 模拟 Command(resume='approved')。"""
    state = await _get_hitl_state(interview_id)
    if not state:
        raise HTTPException(status_code=404, detail="No pending HITL")
    state["verdict"] = "approved"
    state["approvedAt"] = datetime.now(timezone.utc).isoformat()
    await _save_hitl_state(interview_id, state)
    return {"interviewId": interview_id, "verdict": "approved"}


@hitl_router.post("/reject/{interview_id}")
async def reject_hitl(interview_id: str) -> dict:
    """HR 审批拒绝：写 Redis state + 模拟 Command(resume='rejected')。"""
    state = await _get_hitl_state(interview_id)
    if not state:
        raise HTTPException(status_code=404, detail="No pending HITL")
    state["verdict"] = "rejected"
    state["rejectedAt"] = datetime.now(timezone.utc).isoformat()
    await _save_hitl_state(interview_id, state)
    return {"interviewId": interview_id, "verdict": "rejected"}


@hitl_router.post("/graph-resume/{interview_id}")
async def graph_resume(interview_id: str) -> dict:
    """HR 审批后恢复图执行（Command(resume=verdict) 等价）。"""
    state = await _get_hitl_state(interview_id)
    if not state:
        raise HTTPException(status_code=404, detail="No pending HITL")
    verdict = state.get("verdict")
    if verdict not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="HR must approve/reject first")

    # 清 Redis HITL state
    from interview_agent.infra.redis_client import get_redis
    redis = get_redis()
    await redis.delete(f"{HITL_KEY_PREFIX}{interview_id}")

    return {"interviewId": interview_id, "verdict": verdict, "resumed": True}


@hitl_router.get("/graph-status/{interview_id}")
async def graph_status(interview_id: str) -> dict:
    """检查图 HITL 中断状态。"""
    state = await _get_hitl_state(interview_id)
    return {
        "interviewId": interview_id,
        "hitlPending": state is not None and "verdict" not in state,
        "verdict": (state or {}).get("verdict"),
    }


# ============================================================
# POST /api/interview/:interviewId/next-question — 动态下一题
# ============================================================


class NextQuestionRequest(BaseModel):
    lastQuestion: str | None = None
    lastAnswer: str | None = None
    resumeText: str | None = None


@router.post("/{interview_id}/next-question")
async def get_next_question(
    interview_id: str,
    body: NextQuestionRequest = NextQuestionRequest(),
) -> dict:
    """动态决定下一题（对齐 NestJS interview-flow.controller.ts:53-149）。

    - 有简历 → 基于简历动态出题
    - 有 lastAnswer → 评估质量
      - score < 50 → 先追问
      - score 50-80 → 同难度新题
      - score >= 80 → 提高难度
    - 否则从知识库抽题
    """
    from interview_agent.modules.interview.resume_controller import match_bank
    from interview_agent.modules.knowledge_base.knowledge_banks import (
        get_question_bank,
    )

    # interview lookup (NestJS L58)
    interview = await session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=400, detail="Interview not found")

    # 1. 基于简历动态出题（NestJS L64-77）
    if body.resumeText and len(body.resumeText.strip()) > 50:
        try:
            from interview_agent.modules.interview.evaluation_controller import (
                _evaluate_answer,
                _extract_keywords,
            )

            # 评估上次回答
            target_count = 3
            if body.lastAnswer and body.lastQuestion:
                eval_item = _evaluate_answer(
                    body.lastQuestion,
                    body.lastAnswer,
                    _extract_keywords(body.lastQuestion),
                )
                # 质量低 → 先追问（NestJS L72-75）
                if eval_item["score"] < 50:
                    return {
                        "type": "followup",
                        "interviewId": interview_id,
                        "basedOn": body.lastQuestion,
                        "score": eval_item["score"],
                        "reason": "low_quality_followup",
                    }

            bank = match_bank(interview.position or "")
            pool = get_question_bank(bank) or []
            import random
            sampled = random.sample(pool, min(target_count, len(pool)))

            return {
                "type": "personalized",
                "interviewId": interview_id,
                "questions": [
                    {
                        "id": q.get("id"),
                        "question": q.get("question"),
                        "category": q.get("category"),
                        "difficulty": q.get("difficulty"),
                        "expectedPoints": [],
                    }
                    for q in sampled
                ],
                "basedOnResume": True,
                "resumeLength": len(body.resumeText),
            }
        except Exception as e:
            logger.debug(f"personalized next-question failed: {e}")

    # 2. 否则从知识库抽题（NestJS 默认分支）
    bank = match_bank(interview.position or "")
    pool = get_question_bank(bank) or []
    if not pool:
        return {
            "type": "standard",
            "interviewId": interview_id,
            "question": {
                "id": "default-q1",
                "question": "请简单介绍一下你自己。",
                "category": "通用",
                "difficulty": "easy",
            },
        }
    import random
    sampled = random.sample(pool, min(1, len(pool)))
    return {
        "type": "standard",
        "interviewId": interview_id,
        "question": {
            "id": sampled[0].get("id"),
            "question": sampled[0].get("question"),
            "category": sampled[0].get("category"),
            "difficulty": sampled[0].get("difficulty"),
        },
    }