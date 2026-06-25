"""Planner 节点：拆解任务步骤（出题 + 评分策略）"""
import json


PLANNER_PROMPT = """你是面试规划员。规划下一步要做的步骤：

可选步骤类型：
- generate_question：生成面试题
- evaluate_answer：评估候选人回答
- search_knowledge：从知识库检索辅助

只返回 JSON 数组：
[{"step_id": 1, "type": "generate_question", "description": "..."}]
"""


async def planner_node(state, llm, config=None, redis_mem=None) -> dict:
    """根据 user_intent 和历史 steps，规划下一批 steps"""
    messages_str = "\n".join(
        [f"{m.type}: {m.content}" for m in state["messages"][-5:] if hasattr(m, "type")]
    )

    response = await llm.chat([
        {"role": "system", "content": PLANNER_PROMPT},
        {"role": "user", "content": f"对话历史:\n{messages_str}\n\n规划下一步："},
    ])

    try:
        plan = json.loads(response)
        if not isinstance(plan, list):
            plan = [plan]
    except Exception:
        # P1-10 修复：从 state["user_role"] 取候选人岗位，避免硬编码
        # 硬编码 "AI Agent 工程师" 会让 P5 后端 / 数据分析候选人拿到不匹配的题
        user_role = state.get("user_role") or "软件工程师"
        plan = [{"step_id": 1, "type": "generate_question", "description": f"{user_role} 面试题"}]

    return {
        "plan": plan,
        "current_specialist": "planner",
    }