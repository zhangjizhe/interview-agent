"""动态任务队列 — 与 NestJS dynamic-task-queue.service.ts 像素级对齐。

行为：
- 任务类型：question / follow-up / summary / evaluation
- 状态：PENDING / COMPLETED / SKIPPED
- LLM Agent 决策（agentDecide）：一次 LLM 调用输出评分 + 追问/进阶决策
- 启发式降级（heuristicDecide）：无 LLM 时回退
"""
import logging
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from interview_agent.infra.models import (
    AnswerHistory,
    InterviewTask,
    TaskStatus,
    TaskType,
)
from interview_agent.modules.llm.llm_gateway import get_gateway
from interview_agent.modules.llm.providers.types import (
    ChatMessage,
    ChatParams,
)

logger = logging.getLogger(__name__)


class TaskCreate:
    """任务创建请求。"""

    def __init__(
        self,
        interview_id: str,
        type: TaskType,
        question: str,
        category: str,
        difficulty: str = "medium",
        priority: int = 0,
    ):
        self.interview_id = interview_id
        self.type = type
        self.question = question
        self.category = category
        self.difficulty = difficulty
        self.priority = priority


class DynamicTaskQueue:
    """Postgres 持久化的动态任务队列。"""

    async def enqueue(self, session: AsyncSession, task: TaskCreate) -> InterviewTask:
        """入队任务。"""
        import secrets
        row = InterviewTask(
            id=f"t{secrets.token_hex(12)}",
            interview_id=task.interview_id,
            type=task.type,
            question=task.question,
            category=task.category,
            difficulty=task.difficulty,
            priority=task.priority,
            status=TaskStatus.PENDING,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return row

    async def next_pending(self, session: AsyncSession, interview_id: str) -> InterviewTask | None:
        """取下一个 PENDING 任务（priority desc, createdAt asc）。"""
        stmt = (
            select(InterviewTask)
            .where(
                InterviewTask.interview_id == interview_id,
                InterviewTask.status == TaskStatus.PENDING,
            )
            .order_by(InterviewTask.priority.desc(), InterviewTask.created_at.asc())
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def complete(self, session: AsyncSession, task_id: str) -> None:
        """标记任务完成。"""
        row = await session.get(InterviewTask, task_id)
        if row:
            row.status = TaskStatus.COMPLETED
            await session.commit()

    async def skip(self, session: AsyncSession, task_id: str) -> None:
        """跳过任务。"""
        row = await session.get(InterviewTask, task_id)
        if row:
            row.status = TaskStatus.SKIPPED
            await session.commit()

    async def list_tasks(self, session: AsyncSession, interview_id: str) -> list[InterviewTask]:
        """列出所有任务。"""
        stmt = (
            select(InterviewTask)
            .where(InterviewTask.interview_id == interview_id)
            .order_by(InterviewTask.created_at.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())


# ============================================================
# Agent 决策 — agentDecide + heuristicDecide
# ============================================================


async def agent_decide(
    question: str,
    answer: str,
) -> dict:
    """LLM Agent 决策：一次调用输出评分 + 追问/进阶决策。

    Returns:
    ```json
    {
        "score": 0-1,
        "completeness": 0-1,
        "correctness": 0-1,
        "depth": 0-1,
        "feedback": "...",
        "shouldFollowUp": bool,
        "followUpQuestion": "...",
        "shouldAdvance": bool,
        "advancedQuestion": "..."
    }
    ```
    """
    prompt = f"""你是面试评估官。基于以下问答，给出评分与追问/进阶决策。

问题：{question}
回答：{answer}

严格按 JSON 格式输出：
{{
  "score": 0.0-1.0,
  "completeness": 0.0-1.0,
  "correctness": 0.0-1.0,
  "depth": 0.0-1.0,
  "feedback": "评估理由",
  "shouldFollowUp": true/false,
  "followUpQuestion": "追问问题（若 shouldFollowUp=true）",
  "shouldAdvance": true/false,
  "advancedQuestion": "进阶问题（若 shouldAdvance=true）"
}}
"""
    try:
        gateway = get_gateway()
        params = ChatParams(
            messages=[
                ChatMessage(role="system", content="你是一位严谨的面试评估官，只输出 JSON。"),
                ChatMessage(role="user", content=prompt),
            ],
            temperature=0.3,
        )
        response = await gateway.chat(params, primary="qwen")
        # 解析 JSON
        import json
        text = response.content.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except Exception as e:
        logger.warning(f"agent_decide failed, fallback to heuristic: {e}")
        return heuristic_decide(question, answer)


def heuristic_decide(question: str, answer: str) -> dict:
    """启发式降级（无 LLM 时）。"""
    answer_len = len(answer)
    if answer_len < 10:
        return {
            "score": 0.2, "completeness": 0.2, "correctness": 0.2, "depth": 0.1,
            "feedback": "回答过短",
            "shouldFollowUp": True,
            "followUpQuestion": "能否详细说明？",
            "shouldAdvance": False, "advancedQuestion": "",
        }
    if answer_len < 50:
        return {
            "score": 0.5, "completeness": 0.5, "correctness": 0.5, "depth": 0.4,
            "feedback": "基础回答，可深入",
            "shouldFollowUp": True,
            "followUpQuestion": "请举一个具体例子说明。",
            "shouldAdvance": False, "advancedQuestion": "",
        }
    return {
        "score": 0.75, "completeness": 0.8, "correctness": 0.75, "depth": 0.7,
        "feedback": "回答较好",
        "shouldFollowUp": False, "followUpQuestion": "",
        "shouldAdvance": True,
        "advancedQuestion": f"进阶：{question} 在分布式场景下如何处理？",
    }


async def save_answer_history(
    session: AsyncSession,
    interview_id: str,
    question: str,
    answer: str,
    decision: dict,
) -> AnswerHistory:
    """保存问答历史 + 评分。"""
    import secrets
    row = AnswerHistory(
        id=f"ah{secrets.token_hex(12)}",
        interview_id=interview_id,
        question=question,
        answer=answer,
        score=decision.get("score", 0),
        completeness=decision.get("completeness", 0),
        correctness=decision.get("correctness", 0),
        depth=decision.get("depth", 0),
        feedback=decision.get("feedback"),
        llm_evaluated=True,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row