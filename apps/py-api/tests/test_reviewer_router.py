"""test_reviewer_router.py · reviewer_router 运算符优先级 bug 修复验证（P1-4）

原 Bug：原代码 `not state.get("retry_count", 0) > 0` 因 Python 运算符优先级
= `not (state.get(...) > 0)`，意图应是 `state.get(...) == 0`。

修复后行为（用例）：
- hitl_pending=True → hitl_review
- retry_count=0 + final_response 有 → end（正常通过）
- retry_count>0 → planner（reviewer 打回重做）
- retry_count=0 + final_response 空 → planner（修复前是 END 静默失败）
"""
import pytest


def test_reviewer_router_hitl_pending_goes_to_hitl():
    """hitl_pending=True → hitl_review（最高优先级）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {"hitl_pending": True, "final_response": "草稿", "retry_count": 0}
    assert reviewer_router(state) == "hitl_review"


def test_reviewer_router_normal_pass():
    """retry_count=0 + final_response 有 → end（正常通过）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {"hitl_pending": False, "final_response": "通过的回答", "retry_count": 0}
    assert reviewer_router(state) == "end"


def test_reviewer_router_retry_goes_to_planner():
    """retry_count>0 → planner（reviewer 打回）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {"hitl_pending": False, "final_response": "", "retry_count": 2}
    assert reviewer_router(state) == "planner"


def test_reviewer_router_empty_final_response_retry_zero():
    """P1-4 修复：retry_count=0 + final_response 空 → planner（修复前是 END 静默失败）"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {"hitl_pending": False, "final_response": "", "retry_count": 0}
    # 修复前：not 0 > 0 = not False = True, final_response falsy = False → END（错）
    # 修复后：retry_count == 0 → False, retry_count > 0 → False → planner（对）
    assert reviewer_router(state) == "planner"


def test_reviewer_router_final_response_none_treated_as_empty():
    """final_response=None 等价于空"""
    from app.agents.nodes.reviewer import reviewer_router
    state = {"hitl_pending": False, "final_response": None, "retry_count": 0}
    assert reviewer_router(state) == "planner"