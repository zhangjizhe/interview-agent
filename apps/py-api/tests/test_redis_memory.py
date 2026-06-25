"""test_redis_memory.py · RedisMemory L1/L2 真写入验证

覆盖：
- L1 工作记忆 set_working_state / get_working_state / update_working_field / clear
- L2 会话记忆 append_message / get_recent_messages（带 ltrim max_len 限制）
- L2 message 累积顺序
"""
import pytest
import json


@pytest.mark.asyncio
async def test_l1_set_and_get(redis_memory):
    """L1: set_working_state + get_working_state 真写入"""
    await redis_memory.set_working_state(
        "session-1",
        {"status": "running", "thread_id": "t-123", "last_message_at": "2026-06-25T10:00:00Z"},
    )
    state = await redis_memory.get_working_state("session-1")
    assert state["status"] == "running"
    assert state["thread_id"] == "t-123"
    assert state["last_message_at"] == "2026-06-25T10:00:00Z"


@pytest.mark.asyncio
async def test_l1_update_single_field(redis_memory):
    """L1: update_working_field 改单个字段"""
    await redis_memory.set_working_state("s1", {"status": "running"})
    await redis_memory.update_working_field("s1", "status", "completed")
    state = await redis_memory.get_working_state("s1")
    assert state["status"] == "completed"


@pytest.mark.asyncio
async def test_l1_clear(redis_memory):
    """L1: clear_working_state 真删除"""
    await redis_memory.set_working_state("s1", {"x": "1"})
    await redis_memory.clear_working_state("s1")
    state = await redis_memory.get_working_state("s1")
    assert state == {}


@pytest.mark.asyncio
async def test_l2_append_and_get(redis_memory):
    """L2: append_message 真写入 + get_recent_messages 真读取"""
    await redis_memory.append_message("user-1", {"role": "user", "content": "你好"})
    await redis_memory.append_message("user-1", {"role": "assistant", "content": "你好我是 AI"})

    msgs = await redis_memory.get_recent_messages("user-1", limit=10)
    assert len(msgs) == 2
    # 最新在前
    assert msgs[0]["role"] == "assistant"
    assert msgs[1]["role"] == "user"


@pytest.mark.asyncio
async def test_l2_trim_max_len(redis_memory):
    """L2: ltrim 限制最大 50 条"""
    for i in range(60):
        await redis_memory.append_message("u", {"role": "user", "content": f"msg-{i}"})

    msgs = await redis_memory.get_recent_messages("u", limit=100)
    # ltrim 应该保留 50 条
    assert len(msgs) == 50
    # 最新在前
    assert msgs[0]["content"] == "msg-59"
    assert msgs[-1]["content"] == "msg-10"


@pytest.mark.asyncio
async def test_l2_clear_session(redis_memory):
    """L2: clear_session 真清空"""
    await redis_memory.append_message("u", {"role": "user", "content": "x"})
    await redis_memory.clear_session("u")
    msgs = await redis_memory.get_recent_messages("u", limit=10)
    assert msgs == []


@pytest.mark.asyncio
async def test_l2_chinese_content(redis_memory):
    """L2: 中文 content 真序列化（ensure_ascii=False）"""
    await redis_memory.append_message("u", {"role": "user", "content": "中文测试"})
    msgs = await redis_memory.get_recent_messages("u", limit=10)
    assert msgs[0]["content"] == "中文测试"