"""
LangGraph 多 Agent 状态定义（对齐 NestJS state.ts）
使用 TypedDict + Annotated 实现 LangGraph v0.5 兼容的状态合并
"""
from typing import TypedDict, Annotated, List, Optional, Literal
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


class InterviewAgentState(TypedDict):
    """面试 Agent 全局状态（5 节点共享）"""

    # 消息列表（自动追加模式）
    messages: Annotated[List[BaseMessage], add_messages]

    # 用户意图（supervisor 分类结果）
    user_intent: Optional[Literal["interview", "general_qa"]]

    # 当前规划的步骤（planner 输出）
    plan: Optional[List[dict]]

    # 已执行步骤历史（executor 输出）
    past_steps: Annotated[List[dict], lambda x, y: x + y]

    # 重试计数（reviewer 打回时 +1）
    retry_count: int

    # 最终回复
    final_response: Optional[str]

    # Reviewer 输出（HITL 中断用）
    review_score: Optional[float]
    review_issues: Optional[List[str]]
    review_suggestion: Optional[str]

    # HITL 状态
    hitl_pending: bool
    hitl_verdict: Optional[Literal["approved", "rejected"]]

    # 当前节点（用于前端 SSE 流式追踪）
    current_specialist: Optional[str]

    # 用户上下文（P1-6 修复：从 interview /start 注入，
    # executor.search_knowledge 用此 user_id 做 Mem0 recall 隔离）
    user_id: Optional[str]
    user_role: Optional[str]  # 候选人岗位（P1-10 planner fallback 用）


def create_initial_state(user_message: str, user_id: Optional[str] = None, user_role: Optional[str] = None) -> InterviewAgentState:
    """从用户消息构造初始 state

    Args:
        user_message: 用户输入
        user_id: 用户 ID（P1-6 修复：executor 记忆召回用）
        user_role: 候选人岗位（P1-10 修复：planner fallback 出题匹配岗位）
    """
    from langchain_core.messages import HumanMessage
    return {
        "messages": [HumanMessage(content=user_message)],
        "user_intent": None,
        "plan": None,
        "past_steps": [],
        "retry_count": 0,
        "final_response": None,
        "review_score": None,
        "review_issues": None,
        "review_suggestion": None,
        "hitl_pending": False,
        "hitl_verdict": None,
        "current_specialist": None,
        "user_id": user_id,
        "user_role": user_role,
    }