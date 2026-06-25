"""Interview 周边 route · 2026-06-25 web ↔ py-api 对齐

补 8 个 web 调用但 py-api 缺的 endpoint：
1. POST /api/interview/upload-resume      FormData(file, position, userId) → {ragIngested, parsed, standardQuestions, personalizedQuestions, ...}
2. GET  /api/interview/list?userId        → Interview[]
3. GET  /api/interview/stats?userId       → {total, completed, totalTokens, estimatedCostCny}
4. GET  /api/interview/{id}               → 单个 interview 详情（含 messages / resume / report）
5. DELETE /api/interview/{id}?userId      → {ok: true}
6. POST /api/interview/{id}/end           → {ok, finalReport, deleted?, reason?}
7. POST /api/interview/{id}/confirm-resume → {ok: true}
8. POST /api/interview/{id}/message       → 复用 /stream 逻辑（SSE 真流式）

不重复：/start（已有 interview.py） + /stream（已有 interview.py）
"""
import json
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import structlog

from app.db.session import get_db as get_session
from app.db.models import Interview, User, Message, Resume, Report, SessionCost
from app.services.resume_parser import (
    extract_text_from_file,
    parse_resume_text,
)
from app.services.question_bank import (
    match_bank,
    pick_standard_questions,
    generate_personalized_questions,
)

logger = structlog.get_logger(__name__)

router = APIRouter()


# === 1. POST /api/interview/upload-resume ===

@router.post("/upload-resume")
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    position: str = Form(...),
    userId: Optional[str] = Form(None),
):
    """上传简历 + 解析 + 写入 L3 Milvus + 选标准题 + 生成个性化题

    对齐 NestJS ResumeController.uploadResume 响应格式
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if not position:
        raise HTTPException(status_code=400, detail="position is required")

    # 1. 读文件
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(status_code=413, detail="File too large (>10MB)")

    # 2. 解析文本
    try:
        text = extract_text_from_file(content, file.filename)
    except Exception as e:
        logger.error("resume_extract_failed", filename=file.filename, error=str(e))
        raise HTTPException(status_code=400, detail=f"简历解析失败: {str(e)}")

    # 3. 结构化
    try:
        parsed = parse_resume_text(text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 4. 写 Milvus（如果有 userId）
    rag_ingested = False
    if userId:
        try:
            from app.memory.milvus_memory import MilvusMemory
            milvus = request.app.state.milvus_mem
            if milvus and milvus.connected:
                await milvus.insert_resume(
                    userId=userId,
                    position=position,
                    parsed=parsed,
                )
                rag_ingested = True
        except Exception as e:
            logger.warning("milvus_ingest_failed", userId=userId, error=str(e))

    # 5. 选标准题
    bank = match_bank(position)
    standard_questions = pick_standard_questions(bank, count=5)

    # 6. 生成个性化题（Qwen LLM）
    qwen = getattr(request.app.state, "qwen_provider", None)
    personalized_questions = []
    if qwen:
        personalized_questions = generate_personalized_questions(
            parsed_resume=parsed,
            position=position,
            bank=bank,
            qwen_provider=qwen,
        )

    # 7. 入库（Resume + Interview）
    try:
        with get_session() as session:
            # 找/建 user
            if userId:
                user = session.query(User).filter_by(id=userId).first()
                if not user:
                    user = User(
                        id=userId,
                        email=f"{userId}@demo.local",
                        name=userId,
                    )
                    session.add(user)
                    session.flush()

            # 建 interview
            interview_id = f"iv_{uuid.uuid4().hex[:12]}"
            interview = Interview(
                id=interview_id,
                userId=userId or "demo-user",
                position=position,
                level="P5",
                status="IN_PROGRESS",
            )
            session.add(interview)

            # 建 resume
            resume = Resume(
                id=f"re_{uuid.uuid4().hex[:12]}",
                interviewId=interview_id,
                userId=userId or "demo-user",
                fileName=file.filename,
                fileType=file.filename.split(".")[-1] if file.filename else None,
                rawText=parsed["raw_text"],
                parsedJson=json.dumps(
                    {k: v for k, v in parsed.items() if k != "raw_text"},
                    ensure_ascii=False,
                ),
                charCount=parsed["char_count"],
            )
            session.add(resume)

            # 建 session_cost（关联 interview）
            cost = SessionCost(
                id=f"sc_{uuid.uuid4().hex[:12]}",
                interviewId=interview_id,
            )
            session.add(cost)

            session.commit()
            logger.info(
                "resume_uploaded",
                interviewId=interview_id,
                fileName=file.filename,
                charCount=parsed["char_count"],
            )
    except Exception as e:
        logger.error("resume_db_save_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"数据库保存失败: {str(e)}")

    return {
        "interviewId": interview_id,
        "parsed": {k: v for k, v in parsed.items() if k != "raw_text"},
        "bank": bank,
        "standardQuestions": standard_questions,
        "personalizedQuestions": personalized_questions,
        "totalQuestions": len(standard_questions) + len(personalized_questions),
        "ragIngested": rag_ingested,
    }


# === 2. GET /api/interview/list ===

@router.get("/list")
async def list_interviews(userId: str):
    """列出用户所有面试（按 startedAt DESC）"""
    with get_session() as session:
        rows = (
            session.query(Interview)
            .filter_by(userId=userId)
            .order_by(Interview.startedAt.desc())
            .all()
        )
        return [
            {
                "id": r.id,
                "userId": r.userId,
                "position": r.position,
                "level": r.level,
                "status": r.status,
                "startedAt": r.startedAt.isoformat() if r.startedAt else None,
                "endedAt": r.endedAt.isoformat() if r.endedAt else None,
                "summary": r.summary,
                "resumeConfirmed": r.resumeConfirmed,
            }
            for r in rows
        ]


# === 3. GET /api/interview/stats ===

@router.get("/stats")
async def interview_stats(userId: str):
    """用户累计统计"""
    with get_session() as session:
        interviews = session.query(Interview).filter_by(userId=userId).all()
        total = len(interviews)
        completed = sum(1 for i in interviews if i.status == "COMPLETED")

        # 累计 token + 成本
        total_tokens = 0
        estimated_cost_cny = 0.0
        for iv in interviews:
            if iv.cost:
                total_tokens += iv.cost.totalTokens or 0
                estimated_cost_cny += (iv.cost.estimatedCostCny or 0) / 100.0

        return {
            "total": total,
            "completed": completed,
            "totalTokens": total_tokens,
            "estimatedCostCny": round(estimated_cost_cny, 3),
        }


# === 4. GET /api/interview/{id} ===

@router.get("/{interview_id}")
async def get_interview(interview_id: str):
    """获取单个 interview 详情（含 messages / resume / report）"""
    with get_session() as session:
        iv = session.query(Interview).filter_by(id=interview_id).first()
        if not iv:
            raise HTTPException(status_code=404, detail="Interview not found")

        messages = (
            session.query(Message)
            .filter_by(interviewId=interview_id)
            .order_by(Message.createdAt.asc())
            .all()
        )

        resume = session.query(Resume).filter_by(interviewId=interview_id).first()
        report = session.query(Report).filter_by(interviewId=interview_id).first()

        return {
            "id": iv.id,
            "userId": iv.userId,
            "position": iv.position,
            "level": iv.level,
            "status": iv.status,
            "startedAt": iv.startedAt.isoformat() if iv.startedAt else None,
            "endedAt": iv.endedAt.isoformat() if iv.endedAt else None,
            "summary": iv.summary,
            "resumeConfirmed": iv.resumeConfirmed,
            "messages": [
                {"role": m.role, "content": m.content, "createdAt": m.createdAt.isoformat() if m.createdAt else None}
                for m in messages
            ],
            "resume": _resume_to_dict(resume) if resume else None,
            "report": _report_to_dict(report) if report else None,
        }


def _resume_to_dict(resume: Resume) -> dict:
    return {
        "id": resume.id,
        "fileName": resume.fileName,
        "fileType": resume.fileType,
        "charCount": resume.charCount,
        "parsed": json.loads(resume.parsedJson) if resume.parsedJson else None,
    }


def _report_to_dict(report: Report) -> dict:
    return {
        "id": report.id,
        "overallScore": report.overallScore,
        "scores": json.loads(report.scoresJson) if report.scoresJson else None,
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "suggestions": report.suggestions,
        "createdAt": report.createdAt.isoformat() if report.createdAt else None,
    }


# === 5. DELETE /api/interview/{id} ===

@router.delete("/{interview_id}")
async def delete_interview(interview_id: str, userId: str):
    """软删除 interview（cascade 删 messages/resume/report/cost）"""
    with get_session() as session:
        iv = session.query(Interview).filter_by(id=interview_id, userId=userId).first()
        if not iv:
            raise HTTPException(status_code=404, detail="Interview not found")
        session.delete(iv)
        session.commit()
        logger.info("interview_deleted", interviewId=interview_id, userId=userId)
    return {"ok": True}


# === 6. POST /api/interview/{id}/end ===

@router.post("/{interview_id}/end")
async def end_interview(interview_id: str, request: Request):
    """结束面试 + 生成评分报告

    对齐 web 期望：{deleted?: no_messages 时直接删, reason?, finalReport?}
    """
    with get_session() as session:
        iv = session.query(Interview).filter_by(id=interview_id).first()
        if not iv:
            raise HTTPException(status_code=404, detail="Interview not found")

        # 1. 查 message 数量（空面试直接删除）
        msg_count = session.query(Message).filter_by(interviewId=interview_id).count()
        if msg_count == 0:
            session.delete(iv)
            session.commit()
            logger.info("empty_interview_deleted", interviewId=interview_id)
            return {"deleted": True, "reason": "no_messages"}

        # 2. 标记 status = COMPLETED
        iv.status = "COMPLETED"
        iv.endedAt = datetime.now(timezone.utc)

        # 3. 生成评分报告（Qwen LLM）
        messages = (
            session.query(Message)
            .filter_by(interviewId=interview_id)
            .order_by(Message.createdAt.asc())
            .all()
        )
        messages_text = "\n".join(
            f"[{m.role}] {m.content[:200]}" for m in messages[-20:]  # 最近 20 条
        )

        report_data = _generate_report(messages_text, iv.position, request)

        report = Report(
            id=f"rp_{uuid.uuid4().hex[:12]}",
            interviewId=interview_id,
            overallScore=report_data.get("overall_score", 0),
            scoresJson=json.dumps(report_data.get("scores", {}), ensure_ascii=False),
            strengths=report_data.get("strengths", ""),
            weaknesses=report_data.get("weaknesses", ""),
            suggestions=report_data.get("suggestions", ""),
        )
        session.add(report)
        session.commit()

        return {
            "ok": True,
            "finalReport": _report_to_dict(report),
        }


def _generate_report(messages_text: str, position: str, request: Request) -> dict:
    """用 Qwen 生成评分报告（多维度 + 评语）"""
    qwen = getattr(request.app.state, "qwen_provider", None)
    if not qwen:
        return {
            "overall_score": 0,
            "scores": {},
            "strengths": "评分生成失败（Qwen 未配置）",
            "weaknesses": "",
            "suggestions": "",
        }

    import asyncio
    import json
    prompt = f"""你是一位资深【{position}】面试官。请基于以下对话内容，生成结构化评分报告。

【对话内容】
{messages_text}

【输出格式（严格 JSON）】
{{
  "overall_score": 0-100,
  "scores": {{
    "技术能力": 0-100,
    "表达能力": 0-100,
    "逻辑思维": 0-100,
    "项目经验": 0-100
  }},
  "strengths": "候选人的 3 个优点（每点 1 句话）",
  "weaknesses": "候选人的 3 个不足（每点 1 句话）",
  "suggestions": "3 条具体改进建议（每条 1 句话）"
}}

只输出 JSON，不要其他文字。
"""
    try:
        async def _call():
            return await qwen.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=2000,
            )
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        raw = loop.run_until_complete(_call())
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as e:
        logger.warning("report_generation_failed", error=str(e))
        return {
            "overall_score": 0,
            "scores": {},
            "strengths": f"评分生成失败: {e}",
            "weaknesses": "",
            "suggestions": "",
        }


# === 7. POST /api/interview/{id}/confirm-resume ===

@router.post("/{interview_id}/confirm-resume")
async def confirm_resume(interview_id: str):
    """确认简历（解锁聊天）"""
    with get_session() as session:
        iv = session.query(Interview).filter_by(id=interview_id).first()
        if not iv:
            raise HTTPException(status_code=404, detail="Interview not found")
        iv.resumeConfirmed = True
        session.commit()
        logger.info("resume_confirmed", interviewId=interview_id)
    return {"ok": True}


# === 8. POST /api/interview/{id}/message ===

class MessageRequest(BaseModel):
    userId: str
    content: str


@router.post("/{interview_id}/message")
async def send_message(interview_id: str, req: MessageRequest, request: Request):
    """发送消息（SSE 流式响应）

    复用 /api/interview/stream 的 asyncio.Queue 逻辑
    """
    from app.api.routes.interview import StreamingTokenCallback, _build_state_for_interview

    # 1. 加载 interview + state
    with get_session() as session:
        iv = session.query(Interview).filter_by(id=interview_id).first()
        if not iv:
            raise HTTPException(status_code=404, detail="Interview not found")

        resume = session.query(Resume).filter_by(interviewId=interview_id).first()
        state = _build_state_for_interview(
            interview=iv,
            resume=resume,
            userId=req.userId,
            user_message=req.content,
        )

    # 2. 跑 graph（同步 + 流式 yield token）
    from fastapi.responses import StreamingResponse
    from app.agents.graph import build_interview_graph
    import asyncio

    graph = build_interview_graph()
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    callback = StreamingTokenCallback(queue)

    async def event_generator():
        async def run_graph():
            try:
                async for event in graph.astream(state, config={"callbacks": [callback]}):
                    pass
            except Exception as e:
                logger.error("message_graph_error", interviewId=interview_id, error=str(e))
                await queue.put({"type": "error", "message": str(e)})
            finally:
                await queue.put(None)

        graph_task = asyncio.create_task(run_graph())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
        finally:
            graph_task.cancel()
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )