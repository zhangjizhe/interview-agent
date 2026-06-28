"""Evaluation Controller — 与 NestJS evaluation.controller.ts 像素级对齐。

路由（3 个，对齐 NestJS evaluation.controller.ts:32-92）：
- POST /api/interview/evaluate-answer              — 评分单题（无 interview 关联）
- POST /api/interview/:interviewId/evaluate-answer — 评分并保存到 answer_history
- POST /api/interview/:interviewId/generate-report — 生成综合面试报告

NestJS 实现：apps/api/src/modules/interview/controllers/evaluation.controller.ts
"""
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from interview_agent.infra.db import async_session_factory
from interview_agent.infra.models import AnswerHistory, Interview, Report

logger = logging.getLogger(__name__)

# 静态路由前缀（与 dynamic :interviewId 区分）
router = APIRouter(tags=["evaluation"])


def _extract_keywords(question: str) -> list[str]:
    """NestJS keyword-extract.util: 从问题文本提取关键词。

    简化：拆词 + 去停用词 + 去重。
    """
    import re

    # 中文按 2 字拆，英文按 word 拆
    words: list[str] = []
    for token in re.split(r"[\s,，、。?？!！;；:：]+", question):
        if not token:
            continue
        # 中文 2-gram
        if re.search(r"[\u4e00-\u9fff]", token):
            for i in range(len(token) - 1):
                w = token[i : i + 2]
                if w and len(w) == 2:
                    words.append(w)
        else:
            if len(token) >= 2:
                words.append(token.lower())
    return list(dict.fromkeys(words))[:10]


def _evaluate_answer(question: str, answer: str, expected_points: list[str]) -> dict:
    """NestJS ScoringService.evaluateAnswer。

    简化打分逻辑：
    - 答案长度 < 10 字 → 低分
    - 关键词命中数 / 总关键词数 = 命中率 → 映射到 0-100
    """
    answer_clean = answer.strip()
    if len(answer_clean) < 10:
        return {
            "question": question,
            "score": 20,
            "feedback": "答案太短，建议补充具体内容。",
            "matched": [],
            "missing": expected_points,
        }

    matched = [k for k in expected_points if k.lower() in answer_clean.lower()]
    missing = [k for k in expected_points if k not in matched]
    hit_rate = len(matched) / max(len(expected_points), 1)

    # 长度因子：超过 100 字 +10 分
    length_bonus = 10 if len(answer_clean) > 100 else 0
    base_score = int(hit_rate * 80) + length_bonus
    score = max(0, min(100, base_score))

    if score >= 80:
        feedback = "回答完整，覆盖了核心要点。"
    elif score >= 60:
        feedback = "回答基本到位，可以更深入。"
    elif score >= 40:
        feedback = "回答部分覆盖，建议补充关键细节。"
    else:
        feedback = "回答较浅，建议结合实际经验展开。"

    return {
        "question": question,
        "score": score,
        "feedback": feedback,
        "matched": matched,
        "missing": missing,
    }


def _generate_report(evaluations: list[dict]) -> dict:
    """NestJS ScoringService.generateReport。

    综合评分 + 优势/改进/总结。
    """
    if not evaluations:
        return {
            "overallScore": 0,
            "finalRecommendation": "reject",
            "summary": "无有效答题记录。",
            "strengthAreas": [],
            "improvementAreas": [],
            "skillBreakdown": {},
        }

    overall = sum(e["score"] for e in evaluations) / len(evaluations)
    if overall >= 80:
        recommendation = "strong_hire"
    elif overall >= 65:
        recommendation = "hire"
    elif overall >= 50:
        recommendation = "maybe"
    else:
        recommendation = "reject"

    strengths = [e["question"] for e in evaluations if e["score"] >= 70]
    improvements = [e["question"] for e in evaluations if e["score"] < 60]

    return {
        "overallScore": round(overall, 2),
        "finalRecommendation": recommendation,
        "summary": f"综合评分 {round(overall, 1)} 分，共 {len(evaluations)} 道题。",
        "strengthAreas": strengths[:5],
        "improvementAreas": improvements[:5],
        "skillBreakdown": {
            "技术理解": round(sum(e["score"] for e in evaluations) / len(evaluations), 2),
        },
    }


# ============================================================
# POST /api/interview/evaluate-answer
# ============================================================


class EvaluateAnswerRequest(BaseModel):
    question: str
    answer: str
    category: str | None = None


@router.post("/evaluate-answer")
async def evaluate_answer(body: EvaluateAnswerRequest) -> dict:
    """评分单道题（NestJS L32-49）。

    返 AnswerEvaluation：{question, score, feedback, matched, missing}
    """
    if not body.question or not body.answer:
        raise HTTPException(
            status_code=400, detail="question and answer are required"
        )

    expected_points = _extract_keywords(body.question)
    return _evaluate_answer(body.question, body.answer, expected_points)


# ============================================================
# POST /api/interview/:interviewId/evaluate-answer
# ============================================================


@router.post("/{interview_id}/evaluate-answer")
async def evaluate_answer_in_interview(
    interview_id: str,
    body: EvaluateAnswerRequest,
) -> dict:
    """评分并保存（NestJS L55-86）。"""
    if not body.question or not body.answer:
        raise HTTPException(
            status_code=400, detail="question and answer are required"
        )

    # 校验 interview 存在（NestJS L60-61）
    async with async_session_factory() as session:
        interview = await session.get(Interview, interview_id)
        if not interview:
            raise HTTPException(status_code=400, detail="Interview not found")

    expected_points = _extract_keywords(body.question)
    evaluation = _evaluate_answer(body.question, body.answer, expected_points)

    # 保存到 answer_history（NestJS L75-83）
    from interview_agent.infra.db import async_session_factory
    from datetime import datetime

    async with async_session_factory() as session:
        history = AnswerHistory(
            id=f"h-{int(datetime.utcnow().timestamp() * 1000)}",
            interview_id=interview_id,
            question=body.question,
            answer=body.answer,
            score=evaluation["score"],
            feedback=evaluation.get("feedback"),
        )
        session.add(history)
        await session.commit()
        await session.refresh(history)
        saved_id = history.id

    return {**evaluation, "savedId": saved_id}


# ============================================================
# POST /api/interview/:interviewId/generate-report
# ============================================================


@router.post("/{interview_id}/generate-report")
async def generate_interview_report(interview_id: str) -> dict:
    """生成综合面试报告（NestJS L92-178）。"""
    from interview_agent.infra.models import Message

    async with async_session_factory() as session:
        interview = await session.get(Interview, interview_id)
        if not interview:
            raise HTTPException(status_code=400, detail="Interview not found")

        # 取所有消息按时间排序
        result = await session.execute(
            select(Message)
            .where(Message.interview_id == interview_id)
            .order_by(Message.created_at.asc())
        )
        messages = result.scalars().all()

    # 提取 Q-A 对（NestJS L103-115）
    pairs: list[dict[str, str]] = []
    for i in range(len(messages) - 1):
        if messages[i].role == "user":
            next_msg = messages[i + 1]
            if next_msg and next_msg.role == "assistant":
                pairs.append({
                    "q": messages[i].content,
                    "a": next_msg.content,
                })

    evaluations = []
    for pair in pairs:
        if not pair["a"] or len(pair["a"].strip()) < 5:
            continue
        expected_points = _extract_keywords(pair["q"])
        eval_item = _evaluate_answer(pair["q"], pair["a"], expected_points)
        evaluations.append(eval_item)

    if not evaluations:
        return {
            "success": False,
            "reason": "no_valid_answers",
            "message": "暂无足够的答题记录生成报告",
        }

    report = _generate_report(evaluations)

    # 保存到 reports 表（NestJS L142-158）
    from datetime import datetime

    async with async_session_factory() as session:
        # 简化：upsert 直接 select + update/create
        result = await session.execute(
            select(Report).where(Report.interview_id == interview_id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.overall_score = report["overallScore"]
            existing.scores = report
            existing.strengths = "\n".join(report["strengthAreas"])
            existing.weaknesses = "\n".join(report["improvementAreas"])
            existing.suggestions = report["summary"]
            existing.updated_at = datetime.utcnow()
            saved_id = existing.id
        else:
            new_report = Report(
                id=f"r-{int(datetime.utcnow().timestamp() * 1000)}",
                interview_id=interview_id,
                overall_score=report["overallScore"],
                scores=report,
                strengths="\n".join(report["strengthAreas"]),
                weaknesses="\n".join(report["improvementAreas"]),
                suggestions=report["summary"],
            )
            session.add(new_report)
            await session.flush()
            saved_id = new_report.id
        await session.commit()

    return {
        "success": True,
        "report": {
            "overallScore": report["overallScore"],
            "recommendation": report["finalRecommendation"],
            "summary": report["summary"],
            "strengths": report["strengthAreas"],
            "improvements": report["improvementAreas"],
            "skillBreakdown": report["skillBreakdown"],
        },
        "evaluations": [
            {
                "question": e["question"],
                "score": e["score"],
                "feedback": e["feedback"],
            }
            for e in evaluations
        ],
        "savedReportId": saved_id,
    }
