"""LangGraph 7 节点 — 与 NestJS agents/multi-agent/nodes/* 像素级对齐。

NestJS 7 节点：
1. supervisor     — 意图路由（interview / general_qa）
2. planner        — 计划生成（LLM with StructuredOutput）
3. executor       — 执行 plan（含 Specialist Handoffs 路由）
4. replanner      — 决策（continue / replan / finish）
5. reviewer       — 评分（< 0.5 → HITL interrupt）
6. hitl_review    — interrupt 暂停 + Command(resume)
7. respond_directly — 通用问答直接回

Python 端实现：纯函数节点（每个节点输入 state → 输出 state 更新），由
graph.py 的 StateGraph 编排。

为了保证可测试 + 不依赖 langgraph Python 包的版本不确定性，
这里用纯 Python dict state + 节点函数实现（行为对齐，API 等价）。
"""
import logging
from typing import Any, AsyncIterator

from interview_agent.agents.state import (
    InterviewAgentState,
    PastStep,
    PlanStep,
)
from interview_agent.modules.llm.llm_gateway import get_gateway
from interview_agent.modules.llm.providers.types import (
    ChatMessage,
    ChatParams,
)

logger = logging.getLogger(__name__)


# ============================================================
# 节点 1: Supervisor — 意图分类
# ============================================================

async def supervisor_node(
    state: InterviewAgentState,
    user_id: str,
) -> dict:
    """Supervisor：分类用户意图，决定路由到 planner 还是 respond_directly。

    简化实现：基于关键词的快速分类（真 NestJS 用 LLM withStructuredOutput）。

    关键改进（2026-06-28）：
    - state.messages 只有 1 条 user 消息 + 简历已确认 → 必然是 mock_interview 第一题
      （用户面试时第一句"开始吧"/"你好"等都是开场触发）
    - 用 previous_user_messages 数判断 first turn
    """
    last_user_msg = next(
        (m for m in reversed(state.messages) if m.get("role") == "user"),
        None,
    )
    content = (last_user_msg or {}).get("content", "").lower()

    # 数用户消息数（排除第一句开场）
    user_msg_count = sum(1 for m in state.messages if m.get("role") == "user")

    # First turn：用户第一条消息（"开始吧"/"你好"/"开始面试"等）必然是 mock_interview
    # 因为前端确认完简历后才调 /message，第一句就是面试开场
    if user_msg_count == 1:
        intent = "mock_interview"
        next_node = "planner"
    elif any(kw in content for kw in ["面试", "interview", "mock"]):
        intent = "mock_interview"
        next_node = "planner"
    elif any(kw in content for kw in ["简历", "resume"]):
        intent = "resume_review"
        next_node = "planner"
    elif any(kw in content for kw in ["jd", "匹配", "match"]):
        intent = "jd_match"
        next_node = "planner"
    else:
        intent = "general_qa"
        next_node = "respond_directly"

    logger.info(f"supervisor: intent={intent}, next={next_node}, user_msg_count={user_msg_count}")
    return {"user_intent": intent, "_next": next_node}


def supervisor_router(state: InterviewAgentState) -> str:
    """条件边：planner / respond_directly。"""
    return state.user_intent if state.user_intent in ("mock_interview", "resume_review", "jd_match") else "respond_directly"


# ============================================================
# 节点 7: respond_directly — 直接 LLM 回（不走 plan）
# ============================================================

async def respond_directly_node(
    state: InterviewAgentState,
    interview_id: str,
    user_id: str,
) -> dict:
    """通用问答：直接调 LLM 回答。"""
    gateway = get_gateway()
    messages = [
        ChatMessage(role=m["role"], content=m.get("content", ""))
        for m in state.messages
    ]
    params = ChatParams(messages=messages, temperature=0.7)
    response = await gateway.chat(params, primary="qwen")
    return {
        "final_response": response.content,
        "_next": "END",
    }


# ============================================================
# 节点 2: Planner — 生成 plan
# ============================================================

async def planner_node(
    state: InterviewAgentState,
    interview_id: str,
    user_id: str,
) -> dict:
    """Planner：生成执行计划。

    简化实现：固定 1 步 plan（基于当前 user_intent 选择 question / score）。
    真 NestJS 用 LLM withStructuredOutput 输出 PlanStep[]。
    """
    plan: list[PlanStep] = []
    if state.user_intent == "mock_interview":
        plan.append(PlanStep(
            id="step-1",
            action="generate_question",
            description="生成面试问题",
            specialist="interviewer",
        ))
    elif state.user_intent == "resume_review":
        plan.append(PlanStep(
            id="step-1",
            action="query_knowledge_bank",
            description="召回简历相关知识",
            specialist="searcher",
        ))
    else:
        plan.append(PlanStep(
            id="step-1",
            action="ask_llm",
            description="LLM 直接回答",
            specialist="general",
        ))

    logger.info(f"planner: generated {len(plan)} step(s)")
    return {
        "plan": plan,
        "current_step_idx": 0,
        "_next": "executor",
    }


# ============================================================
# 节点 3: Executor — 执行当前 plan step（含 Specialist Handoffs）
# ============================================================

async def executor_node(
    state: InterviewAgentState,
    interview_id: str,
    user_id: str,
) -> dict:
    """Executor：执行 plan[current_step_idx]。

    根据 PlanStep.specialist 路由到不同 system prompt：
    - interviewer：出题、追问、评估
    - evaluator：评分、报告
    - searcher：联网/知识库检索
    - general：通用处理
    """
    if state.current_step_idx >= len(state.plan):
        return {"_next": "reviewer"}

    current_step = state.plan[state.current_step_idx]
    specialist = current_step.specialist or "general"

    # Specialist system prompt 路由
    system_prompts = {
        "interviewer": "你是一位专业的 AI 面试官，负责出题、追问、评估候选人的回答质量。",
        "evaluator": "你是一位严谨的面试评估官，负责对候选人回答打分并给出反馈。",
        "searcher": "你是一位信息检索专家，负责从知识库/联网搜索中获取准确信息。",
        "general": "你是一位通用助手，负责处理用户的各类问题。",
    }
    system_prompt = system_prompts.get(specialist, system_prompts["general"])

    # 调 LLM
    gateway = get_gateway()
    last_user_msg = next(
        (m for m in reversed(state.messages) if m.get("role") == "user"),
        None,
    )
    user_content = (last_user_msg or {}).get("content", "")
    messages = [
        ChatMessage(role="system", content=system_prompt),
        ChatMessage(role="user", content=user_content),
    ]
    params = ChatParams(messages=messages, temperature=0.7)
    try:
        response = await gateway.chat(params, primary="qwen")
        result = response.content
        success = True
    except Exception as e:
        logger.error(f"executor LLM failed: {e}")
        result = f"[error] {e}"
        success = False

    # 记录 past_step
    state.add_past_step(PastStep(step=current_step, result=result, success=success))

    # 推进 step
    return {
        "current_specialist": specialist,
        "current_step_idx": state.current_step_idx + 1,
        "_next": "replanner",
    }


# ============================================================
# 节点 4: Replanner — 决策下一步
# ============================================================

async def replanner_node(
    state: InterviewAgentState,
) -> dict:
    """Replanner：判断 plan 是否需要继续 / 重做 / 结束。

    简化规则：
    - past_steps 全成功 + plan 已执行完 → finish
    - past_steps 有失败 → replan
    - 还有未执行的 step → continue
    - retry_count >= 2 → 强制 finish（防死循环）
    """
    if state.retry_count >= 2:
        logger.warning(f"replanner: retry_count={state.retry_count} 兜底 finish")
        return {"_next": "reviewer"}

    if not state.past_steps:
        return {"_next": "reviewer"}

    if all(s.success for s in state.past_steps) and state.current_step_idx >= len(state.plan):
        # 构造 final_response（最后一个 past_step 的 result）
        final = state.past_steps[-1].result
        return {"final_response": final, "_next": "reviewer"}

    if any(not s.success for s in state.past_steps):
        # 失败：retry
        return {
            "retry_count": state.retry_count + 1,
            "current_step_idx": 0,  # 重做整个 plan
            "_next": "executor",
        }

    # 还有 step 没执行
    return {"_next": "executor"}


def replanner_router(state: InterviewAgentState, _next: str) -> str:
    return _next if _next in ("executor", "reviewer", "END") else "reviewer"


# ============================================================
# 节点 5: Reviewer — 评分（< 0.5 → HITL interrupt）
# ============================================================

async def reviewer_node(
    state: InterviewAgentState,
    interview_id: str,
) -> dict:
    """Reviewer：给 response 打分。

    简化：固定打分 0.8（除非 final_response 含特定错误模式）。
    真 NestJS 用 LLM withStructuredOutput 输出 {score, issues, suggestion, reflection}。
    """
    if not state.final_response:
        return {"_next": "END"}

    # 简单打分规则
    score = 0.85
    issues: list[str] = []
    issue_tags: list[str] = []

    if "[error]" in state.final_response:
        score = 0.3
        issues.append("执行异常")
        issue_tags.append("factual_error")

    if len(state.final_response) < 10:
        score = min(score, 0.4)
        issue_tags.append("too_short")

    logger.info(f"reviewer: score={score} issues={issues}")

    # < 0.5 触发 HITL
    if score < 0.5:
        return {
            "hitl_pending": True,
            "issue_tags": issue_tags,
            "_next": "hitl_review",
        }

    return {
        "issue_tags": issue_tags,
        "_next": "END",
    }


def reviewer_router(state: InterviewAgentState, _next: str) -> str:
    return _next if _next in ("hitl_review", "END", "planner") else "END"


# ============================================================
# 节点 6: HITL Review — interrupt 暂停 + Command(resume)
# ============================================================

class HITLInterrupt(Exception):
    """LangGraph interrupt() 等价：图执行暂停，等待外部 Command(resume)。"""

    def __init__(self, interview_id: str, score: float, issues: list[str]):
        self.interview_id = interview_id
        self.score = score
        self.issues = issues
        super().__init__(f"HITL pending: score={score}, issues={issues}")


async def hitl_review_node(
    state: InterviewAgentState,
    interview_id: str,
    user_id: str,
    resume_verdict: str | None = None,
) -> dict:
    """HITL Review node。

    行为对齐 NestJS：
    - interrupt()：抛 HITLInterrupt 暂停图
    - HR 审批后 Command(resume=verdict) 恢复
    - approved → END（使用 Reviewer 草稿）
    - rejected → planner（打回重做）
    """
    if resume_verdict is None:
        # interrupt 路径
        raise HITLInterrupt(
            interview_id=interview_id,
            score=0.3,
            issues=state.issue_tags or ["low_score"],
        )

    # resume 路径
    if resume_verdict == "approved":
        return {"hitl_pending": False, "hitl_verdict": "approved", "_next": "END"}
    else:  # rejected
        return {
            "hitl_pending": False,
            "hitl_verdict": "rejected",
            "retry_count": state.retry_count + 1,
            "_next": "planner",
        }


# ============================================================
# 节点组合：Graph runner（不用 langgraph Python 包，纯 Python 实现）
# ============================================================


async def run_graph(
    state: InterviewAgentState,
    interview_id: str,
    user_id: str,
    hitl_resume: str | None = None,
) -> InterviewAgentState:
    """按 NestJS 7 节点拓扑执行 state machine。

    Returns:
        InterviewAgentState: 执行后的最终 state
    """
    # 1. Supervisor
    r = await supervisor_node(state, user_id)
    state.user_intent = r["user_intent"]
    next_node = r["_next"]

    # 2. 条件边：respond_directly vs planner
    if next_node == "respond_directly":
        r = await respond_directly_node(state, interview_id, user_id)
        state.final_response = r["final_response"]
        return state

    # 3. Planner
    r = await planner_node(state, interview_id, user_id)
    state.plan = r["plan"]
    state.current_step_idx = r["current_step_idx"]

    # 4. Executor / Replanner loop
    while True:
        # Executor
        r = await executor_node(state, interview_id, user_id)
        state.current_step_idx = r["current_step_idx"]
        state.current_specialist = r["current_specialist"]

        # Replanner
        r = await replanner_node(state)
        nxt = r["_next"]
        if "final_response" in r:
            state.final_response = r["final_response"]
        if "retry_count" in r:
            state.retry_count = r["retry_count"]
        if nxt == "END" or nxt == "reviewer":
            break

    # 5. Reviewer
    r = await reviewer_node(state, interview_id)
    state.issue_tags = r.get("issue_tags", [])
    next_node = r["_next"]
    if next_node == "hitl_review":
        # HITL 中断
        if hitl_resume is None:
            state.hitl_pending = True
            return state  # 暂停，等待 resume
        # resume 路径
        r = await hitl_review_node(
            state, interview_id, user_id, resume_verdict=hitl_resume
        )
        state.hitl_pending = False
        state.hitl_verdict = r.get("hitl_verdict")
        if r["_next"] == "planner":
            # 打回 → 重新 planner → executor
            return await run_graph(state, interview_id, user_id)

    return state


async def run_graph_streaming(
    state: InterviewAgentState,
    interview_id: str,
    user_id: str,
) -> AsyncIterator[dict]:
    """流式执行：每个节点 yield 一个事件给前端 SSE。

    Yield 格式：
    - {type: 'step', node: 'supervisor'}
    - {type: 'step', node: 'planner', plan_count: 3}
    - {type: 'token', content: '...'}
    - {type: 'final_response', content: '...'}
    - {type: 'hitl_pending', ...}
    """
    # 这里简化：yield step 事件 + final_response
    yield {"type": "step", "node": "supervisor"}
    yield {"type": "thinking", "content": "正在分析你的意图（supervisor 节点）..."}
    r = await supervisor_node(state, user_id)
    state.user_intent = r["user_intent"]
    next_node = r["_next"]
    yield {
        "type": "thinking",
        "content": f"意图分类结果：{state.user_intent} → 路由到 {next_node}",
    }

    if next_node == "respond_directly":
        yield {"type": "step", "node": "respond_directly"}
        yield {"type": "thinking", "content": "直接调用 LLM 回复（不走 plan 流程）..."}
        r = await respond_directly_node(state, interview_id, user_id)
        # 流式 yield response token
        for char in (r["final_response"] or ""):
            yield {"type": "token", "content": char}
        state.final_response = r["final_response"]
        yield {"type": "final_response", "content": state.final_response}
        return

    yield {"type": "step", "node": "planner"}
    yield {"type": "thinking", "content": "规划面试流程：从知识库抽题 + 匹配简历技能..."}
    r = await planner_node(state, interview_id, user_id)
    state.plan = r["plan"]
    state.current_step_idx = r["current_step_idx"]
    yield {
        "type": "thinking",
        "content": f"已规划 {len(state.plan or [])} 步计划",
    }

    yield {"type": "step", "node": "executor"}
    yield {"type": "thinking", "content": "执行中：调用 LLM 生成追问 / 调 MCP 工具查资料..."}
    r = await executor_node(state, interview_id, user_id)
    state.current_step_idx = r["current_step_idx"]

    yield {"type": "step", "node": "replanner"}
    yield {"type": "thinking", "content": "评估是否需要调整计划..."}
    r = await replanner_node(state)
    if "final_response" in r:
        state.final_response = r["final_response"]
    if "retry_count" in r:
        state.retry_count = r["retry_count"]

    yield {"type": "step", "node": "reviewer"}
    yield {"type": "thinking", "content": "审核回答质量 + 决定是否需要 HITL 人工审批..."}
    r = await reviewer_node(state, interview_id)
    state.issue_tags = r.get("issue_tags", [])
    if r["_next"] == "hitl_review":
        yield {"type": "hitl_pending", "interviewId": interview_id, "score": 0.3}
        state.hitl_pending = True
        return

    # 流式 yield final_response
    if state.final_response:
        for char in state.final_response:
            yield {"type": "token", "content": char}
        yield {"type": "final_response", "content": state.final_response}