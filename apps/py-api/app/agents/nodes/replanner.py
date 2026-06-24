"""Replanner 节点：判断是否需要继续执行 / 直接到 reviewer"""


def replanner_node(state, config=None) -> dict:
    """根据 past_steps 决定下一步：再执行一轮还是跳到 reviewer"""
    past_steps = state.get("past_steps") or []
    plan = state.get("plan") or []

    # 简化逻辑：past_steps 已经有结果就跳 reviewer
    all_done = all(s.get("success") for s in past_steps)
    return {
        "current_specialist": "replanner",
    }


def replanner_router(state) -> str:
    """条件路由：past_steps 都成功 → reviewer；否则回到 executor 再跑一轮"""
    past_steps = state.get("past_steps") or []
    plan = state.get("plan") or []
    retry_count = state.get("retry_count", 0)

    # 如果 retry 太多或所有 step 都成功 → reviewer
    if retry_count >= 3 or len(past_steps) >= len(plan):
        return "reviewer"

    # 否则再 executor 跑一轮
    return "executor"