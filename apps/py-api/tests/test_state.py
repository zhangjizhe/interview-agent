"""test_state.py · create_initial_state user_id + user_role 注入（P1-6 + P1-10 修复）"""
import pytest


def test_create_initial_state_with_user_id():
    """create_initial_state 接收 user_id 参数（P1-6）"""
    from app.agents.state import create_initial_state
    state = create_initial_state("你好", user_id="user-123", user_role="P5 后端")
    assert state["user_id"] == "user-123"
    assert state["user_role"] == "P5 后端"
    assert state["retry_count"] == 0
    assert state["hitl_pending"] is False
    assert state["final_response"] is None


def test_create_initial_state_without_user_id():
    """向后兼容：不传 user_id 也 OK"""
    from app.agents.state import create_initial_state
    state = create_initial_state("测试")
    assert state["user_id"] is None
    assert state["user_role"] is None


def test_create_initial_state_messages_is_humanmessage():
    """messages 应该是 [HumanMessage(content=...)]"""
    from app.agents.state import create_initial_state
    from langchain_core.messages import HumanMessage
    state = create_initial_state("测试消息")
    assert len(state["messages"]) == 1
    assert isinstance(state["messages"][0], HumanMessage)
    assert state["messages"][0].content == "测试消息"


def test_state_has_required_fields():
    """state 必须有所有 LangGraph 节点用的字段"""
    from app.agents.state import create_initial_state
    state = create_initial_state("x")
    required = [
        "messages", "user_intent", "plan", "past_steps",
        "retry_count", "final_response", "review_score",
        "review_issues", "review_suggestion",
        "hitl_pending", "hitl_verdict", "current_specialist",
        "user_id", "user_role",  # P1-6 / P1-10 新增
    ]
    for k in required:
        assert k in state, f"missing field: {k}"