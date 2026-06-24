"""Supervisor 节点：意图分类（interview vs general_qa）"""
from langchain_core.messages import SystemMessage, HumanMessage


SUPERVISOR_PROMPT = """你是面试 Agent 调度员。判断用户意图：

- interview: 面试相关（出题、答题、点评、岗位匹配）
- general_qa: 闲聊 / 非面试问题

只返回 JSON：`{"intent": "interview" | "general_qa", "reason": "..."}`
"""


async def supervisor_node(state, llm, config=None, redis_mem=None) -> dict:
    """读取最近消息，分类用户意图，写入 state.user_intent"""
    last_msg = state["messages"][-1]
    user_text = last_msg.content if hasattr(last_msg, "content") else str(last_msg)

    response = await llm.chat([
        {"role": "system", "content": SUPERVISOR_PROMPT},
        {"role": "user", "content": user_text},
    ])

    # 简单 JSON 解析（生产应该用 Pydantic）
    import json
    try:
        parsed = json.loads(response)
        intent = parsed.get("intent", "general_qa")
    except Exception:
        # 兜底：默认走 interview（更稳）
        intent = "general_qa" if any(kw in user_text for kw in ["你好", "聊聊", "介绍"]) else "interview"

    return {
        "user_intent": intent,
        "current_specialist": "supervisor",
    }


def supervisor_router(state) -> str:
    """意图路由"""
    return "respond_directly" if state.get("user_intent") == "general_qa" else "planner"