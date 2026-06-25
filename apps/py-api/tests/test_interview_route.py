"""test_interview_route.py · /api/interview/start + /stream（P1-6 + P1-8 修复）

覆盖：
- /start 200 + 注入 user_id + user_role
- /start 异常 → 500 + fallback_message
- /start Redis L1/L2 真写入（用 fake_redis fixture）
- /stream SSE event 流（node + final_response + [DONE]）
- /stream graph 异常 → error event + [DONE]
- /start graph not initialized → 503
"""
from unittest.mock import AsyncMock, MagicMock
import pytest
import json


def test_start_returns_final_response(client):
    """/start 200 + 返回 final_response + reviewer score"""
    resp = client.post("/api/interview/start", json={
        "user_id": "user-1",
        "user_message": "你好",
        "thread_id": "thread-1",
        "user_role": "P5 后端",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["final_response"] == "Mock final response"
    assert data["review_score"] == 85.0
    assert data["hitl_pending"] is False
    assert data["node_path"] == "reviewer"


def test_start_injects_user_id_into_state(client):
    """/start graph.ainvoke 收到的 initial state 包含 user_id + user_role（P1-6）"""
    # 先调用 /start，让 graph.ainvoke 被触发
    client.post("/api/interview/start", json={
        "user_id": "user-1",
        "user_message": "你好",
        "user_role": "P5 后端",
    })
    app = client.app
    call_args = app.state.interview_graph.ainvoke.call_args

    initial = call_args.args[0]
    assert initial["user_id"] == "user-1"
    assert initial["user_role"] == "P5 后端"
    assert initial["messages"][0].content == "你好"


def test_start_returns_503_when_graph_not_initialized(client):
    """/start graph not initialized → 503"""
    app = client.app
    app.state.interview_graph = None

    resp = client.post("/api/interview/start", json={
        "user_id": "u",
        "user_message": "x",
    })
    assert resp.status_code == 503
    assert "Graph not initialized" in resp.json()["detail"]


def test_start_returns_500_when_graph_raises(client):
    """/start graph 抛异常 → 500 + fallback_message（P1-8）"""
    app = client.app
    app.state.interview_graph.ainvoke = AsyncMock(side_effect=RuntimeError("LLM rate limit"))

    resp = client.post("/api/interview/start", json={
        "user_id": "u",
        "user_message": "x",
    })
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert detail["error"] == "interview_failed"
    assert "fallback_message" in detail


def test_start_writes_redis_l1_and_l2(client):
    """/start 真写入 L1 working state + L2 messages（用 conftest 的 fake_redis）"""
    # conftest 已经把 redis_mem.client 替换为 fake_redis
    fake_redis = client.app.state._state["_fake_redis"]

    client.post("/api/interview/start", json={
        "user_id": "redis-test-user",
        "user_message": "测试 L1/L2 写入",
    })

    # L1 working state 写入验证
    working = fake_redis.hashes.get("interview:redis-test-user:working", {})
    assert working["status"] == "completed"
    assert working["thread_id"] == "redis-test-user"

    # L2 messages 写入验证（user + assistant 共 2 条）
    msgs = fake_redis.lists.get("interview:redis-test-user:messages", [])
    assert len(msgs) == 2
    parsed = [json.loads(m) for m in msgs]
    assert any(m["role"] == "user" and m["content"] == "测试 L1/L2 写入" for m in parsed)
    assert any(m["role"] == "assistant" for m in parsed)


def test_stream_fallback_to_values_mode(client):
    """/stream SSE 包含 node + final_response + [DONE]

    P0-2 修复：用 stream_mode='values'，yield dict state
    事件类型：node + final_response + [DONE]（对齐 NestJS streamWithSteps）
    """
    with client.stream("POST", "/api/interview/stream", json={
        "user_id": "u",
        "user_message": "x",
    }) as resp:
        assert resp.status_code == 200
        chunks = []
        for line in resp.iter_lines():
            chunks.append(line)

    joined = "\n".join(chunks)
    assert "node" in joined
    assert "final_response" in joined
    assert "Mock final response" in joined
    assert "[DONE]" in joined


def test_stream_yields_tokens_via_callback(client):
    """SSE token 增量推送（P0-2 完整版）：CallbackHandler 收集 token → SSE drain"""
    from langchain_core.messages import AIMessageChunk
    app = client.app

    # mock graph 在 ainvoke 时触发 callback
    async def fake_astream(initial, config=None, stream_mode="values"):
        # 模拟 callbacks 中的 on_chat_model_stream
        callbacks = config.get("callbacks", []) if config else []
        for cb in callbacks:
            # token 1
            if hasattr(cb, "on_chat_model_stream"):
                await cb.on_chat_model_stream(AIMessageChunk(content="你好"))
            yield {"current_specialist": "supervisor", "final_response": None}
            # token 2
            if hasattr(cb, "on_chat_model_stream"):
                await cb.on_chat_model_stream(AIMessageChunk(content="，"))
            # token 3
            if hasattr(cb, "on_chat_model_stream"):
                await cb.on_chat_model_stream(AIMessageChunk(content="我是"))
            yield {"current_specialist": "executor", "final_response": None}
            # final response
            yield {"current_specialist": "reviewer", "final_response": "完整回复"}

    app.state.interview_graph.astream = fake_astream

    with client.stream("POST", "/api/interview/stream", json={
        "user_id": "u",
        "user_message": "x",
    }) as resp:
        assert resp.status_code == 200
        chunks = list(resp.iter_lines())

    joined = "\n".join(chunks)

    # 必须有 token event（3 个增量 token）
    token_events = [c for c in chunks if '"type": "token"' in c]
    assert len(token_events) == 3
    assert "你好" in token_events[0]
    assert "，" in token_events[1]
    assert "我是" in token_events[2]

    # 仍有 node + final_response + DONE
    assert "node" in joined
    assert "final_response" in joined
    assert "完整回复" in joined
    assert "[DONE]" in joined


def test_token_collector_callback_collects_tokens():
    """TokenCollectorCallback 单测：on_chat_model_stream 真收集 token"""
    from langchain_core.messages import AIMessageChunk
    import asyncio

    from app.api.routes.interview import TokenCollectorCallback

    async def run():
        cb = TokenCollectorCallback()
        await cb.on_chat_model_stream(AIMessageChunk(content="你好"))
        await cb.on_chat_model_stream(AIMessageChunk(content="，我是"))
        await cb.on_chat_model_stream(AIMessageChunk(content=" AI"))
        # 旧 API 兼容
        await cb.on_llm_new_token(" 面试官")
        # 空 token 跳过
        await cb.on_chat_model_stream(AIMessageChunk(content=""))
        return cb.tokens

    tokens = asyncio.run(run())
    assert tokens == ["你好", "，我是", " AI", " 面试官"]


def test_stream_yields_error_on_graph_failure(client):
    """/stream graph 抛异常 → error event + [DONE]（P1-8 修复）"""
    app = client.app

    async def failing_astream(initial, config=None, stream_mode="values"):
        yield {"current_specialist": "supervisor"}
        raise RuntimeError("LLM stream interrupted")

    app.state.interview_graph.astream = failing_astream

    with client.stream("POST", "/api/interview/stream", json={
        "user_id": "u",
        "user_message": "x",
    }) as resp:
        assert resp.status_code == 200
        chunks = list(resp.iter_lines())

    joined = "\n".join(chunks)
    assert "error" in joined
    assert "[DONE]" in joined  # 仍 yield DONE，让前端清理 SSE 连接


# ===== 辅助 =====

def await_app_state(app):
    """辅助：直接从 app.state 拿 redis_mem（无需 await 包装）"""
    return app.state.redis_mem