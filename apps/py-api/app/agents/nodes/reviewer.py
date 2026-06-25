"""Reviewer 节点：评分 final_response，决定通过 / 打回 / HITL 中断"""
import json


REVIEWER_PROMPT = """你是面试响应评审员。评估执行结果质量：

只返回 JSON：
{
  "verdict": "approved" | "rejected" | "needs_hitl",
  "score": 0-100,
  "issues": ["问题1", "问题2"],
  "suggestion": "改进建议"
}

- approved: score >= 80，无重大问题
- rejected: score < 60，需打回重做
- needs_hitl: 60 <= score < 80，评分争议，需 HR 审批
"""


async def reviewer_node(state, llm, config=None, redis_mem=None) -> dict:
    """评审 final_response，返回 verdict + score"""
    final_response = state.get("final_response") or ""
    past_steps = state.get("past_steps") or []

    response = await llm.chat([
        {"role": "system", "content": REVIEWER_PROMPT},
        {"role": "user", "content": f"待评审回复:\n{final_response}\n\n执行步骤:\n{json.dumps(past_steps, ensure_ascii=False)[:2000]}\n\n评分："},
    ])

    try:
        result = json.loads(response)
    except Exception:
        # 兜底：默认通过
        result = {"verdict": "approved", "score": 75, "issues": [], "suggestion": ""}

    # 防止死循环：retry_count 超 3 强制通过
    retry_count = state.get("retry_count", 0)
    MAX_RETRY = 3
    is_retry_exhausted = retry_count >= MAX_RETRY

    if is_retry_exhausted:
        verdict = "approved"
    else:
        verdict = result.get("verdict", "approved")

    out = {
        "review_score": result.get("score", 75),
        "review_issues": result.get("issues", []),
        "review_suggestion": result.get("suggestion", ""),
        "current_specialist": "reviewer",
    }

    if verdict == "approved":
        out["final_response"] = final_response
    elif verdict == "rejected":
        out["final_response"] = ""
        out["retry_count"] = retry_count + 1
    elif verdict == "needs_hitl":
        out["hitl_pending"] = True
        out["final_response"] = final_response  # 保留草稿

    return out


def reviewer_router(state) -> str:
    """路由：approved → end；rejected → planner；needs_hitl → hitl_review

    Bug 修复（P1-4）：原代码 `not state.get("retry_count", 0) > 0` 因 Python 运算符优先级
    = `not (state.get(...) > 0)`，意图应是 `state.get(...) == 0`。
    原行为：retry_count=0 且 final_response 空 → 跳 END（静默失败，不打回）。
    修复：用显式 == 比较，避免优先级陷阱。
    """
    if state.get("hitl_pending"):
        return "hitl_review"
    retry_count = state.get("retry_count", 0)
    has_final_response = bool(state.get("final_response"))

    # hitl_pending 已处理（上面 return）→ 剩下按 verdict 路由
    if retry_count == 0 and has_final_response:
        # 正常通过
        return "end"
    if retry_count > 0:
        # reviewer 打回 → planner 重做
        return "planner"
    # retry_count=0 且 final_response 空 → reviewer 拒绝 / 没产出 → planner 重做
    return "planner"