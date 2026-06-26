"""test_reviewer_router.py · reviewer_router 基于 verdict 字段三分支（2026-06-26 P1-4）

verdict 字段由 reviewer_node 写入：
- "approved" → end（如果 final_response 有）
- "rejected" → planner（重做）
- "needs_hitl" → hitl_review（人工审批）

hitl_pending 仍是最短路径（最高优先级）。
"""


def test_reviewer_router_hitl_pending_goes_to_hitl():
    """hitl_pending=True → hitl_review（最高优先级，覆盖 verdict）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {
        "hitl_pending": True,
        "verdict": "approved",
        "final_response": "草稿",
        "retry_count": 0,
    }
    assert reviewer_router(state) == "hitl_review"


def test_reviewer_router_verdict_approved_with_final_response():
    """verdict=approved + final_response 有 → end（正常通过）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {
        "hitl_pending": False,
        "verdict": "approved",
        "final_response": "通过的回答",
        "retry_count": 0,
    }
    assert reviewer_router(state) == "end"


def test_reviewer_router_verdict_approved_without_final_response():
    """verdict=approved + final_response 空 → planner（reviewer_node 还没跑完）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {
        "hitl_pending": False,
        "verdict": "approved",
        "final_response": "",
        "retry_count": 0,
    }
    assert reviewer_router(state) == "planner"


def test_reviewer_router_verdict_rejected():
    """verdict=rejected → planner（重做）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {
        "hitl_pending": False,
        "verdict": "rejected",
        "final_response": "",
        "retry_count": 1,
    }
    assert reviewer_router(state) == "planner"


def test_reviewer_router_verdict_needs_hitl():
    """verdict=needs_hitl → hitl_review（人工审批）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {
        "hitl_pending": False,
        "verdict": "needs_hitl",
        "final_response": "草稿",
        "retry_count": 0,
    }
    assert reviewer_router(state) == "hitl_review"


def test_reviewer_router_verdict_none():
    """verdict 未设（reviewer_node 没跑完）→ planner 兜底"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {
        "hitl_pending": False,
        "verdict": None,
        "final_response": "某个回复",
        "retry_count": 0,
    }
    assert reviewer_router(state) == "planner"