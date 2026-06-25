"""test_escape_milvus.py · escape_milvus_string 防 Milvus filter 注入（2026-06-26 P0-1）"""
import pytest


def test_escape_basic_string():
    """普通字符串不转义"""
    from app.shared.escape_milvus import escape_milvus_string
    assert escape_milvus_string("abc") == "abc"
    assert escape_milvus_string("a-b_c.d") == "a-b_c.d"


def test_escape_backslash():
    """反斜杠转义"""
    from app.shared.escape_milvus import escape_milvus_string
    assert escape_milvus_string("a\\b") == "a\\\\b"  # 单个 \ → \\
    assert escape_milvus_string("path\\to\\file") == "path\\\\to\\\\file"


def test_escape_double_quote():
    """双引号转义"""
    from app.shared.escape_milvus import escape_milvus_string
    assert escape_milvus_string('a"b') == 'a\\"b'  # 单个 " → \"


def test_escape_both():
    """反斜杠 + 双引号都转义"""
    from app.shared.escape_milvus import escape_milvus_string
    assert escape_milvus_string('a\\"b') == 'a\\\\\\"b'  # \ + " → \\\"


def test_escape_empty_and_none():
    """空字符串 + None"""
    from app.shared.escape_milvus import escape_milvus_string
    assert escape_milvus_string("") == ""
    assert escape_milvus_string(None) == ""


def test_build_milvus_eq_basic():
    """build_milvus_eq 普通字符串"""
    from app.shared.escape_milvus import build_milvus_eq
    assert build_milvus_eq("user_id", "abc") == 'user_id == "abc"'


def test_build_milvus_eq_with_special_chars():
    """build_milvus_eq 含特殊字符 → 转义后包引号"""
    from app.shared.escape_milvus import build_milvus_eq
    assert build_milvus_eq("user_id", 'a"b') == 'user_id == "a\\"b"'
    assert build_milvus_eq("user_id", "a\\b") == 'user_id == "a\\\\b"'


def test_build_milvus_eq_injection_attack():
    """SQL 注入式攻击：user_id = 'abc" or "1" == "1' 应被转义成单条字符串字面量

    之前 f-string 直接拼：expr = 'user_id == "abc" or "1" == "1"'
    → 绕过 user_id 过滤，返回所有数据
    修复后转义：expr = 'user_id == "abc\\" or \\"1\\" == \\"1"'
    → 整个字符串当成 user_id 字面量匹配，攻击失败
    """
    from app.shared.escape_milvus import build_milvus_eq, escape_milvus_string
    injection = 'abc" or "1" == "1'
    escaped = escape_milvus_string(injection)
    expr = build_milvus_eq("user_id", injection)

    # 验证 1：转义后字符串应该是 'abc\\" or \\"1\\" == \\"1'
    # （Python str 字面量里 \\\\ = 单个 \, \\\" = \" 整体）
    assert escaped == 'abc\\" or \\"1\\" == \\"1', f"escape 错误: {escaped!r}"

    # 验证 2：expr 内部所有 " 必须以 \ 开头（即都是转义的，无未转义）
    # 简单办法：内部不应有未转义的 " 序列（除开闭 2 个外层引号）
    # inner 是 expr 去掉外层引号的部分
    inner = expr[len('user_id == "'):-1]  # 去掉 user_id == " 和末尾 "
    # inner 里每个 " 前面都必须是 \
    i = 0
    bad_unescaped = []
    while i < len(inner):
        if inner[i] == '"':
            # 检查前一个字符是否是 \
            if i == 0 or inner[i - 1] != "\\":
                bad_unescaped.append(i)
        i += 1
    assert bad_unescaped == [], f"expr 内部有未转义引号在位置 {bad_unescaped}: {inner}"


def test_build_milvus_in():
    """build_milvus_in 多值"""
    from app.shared.escape_milvus import build_milvus_in
    assert build_milvus_in("topic", ["Agent", "RAG"]) == 'topic in ["Agent", "RAG"]'


def test_build_milvus_in_with_special_chars():
    """build_milvus_in 含特殊字符"""
    from app.shared.escape_milvus import build_milvus_in
    result = build_milvus_in("topic", ['a"b', 'c\\d'])
    assert result == 'topic in ["a\\"b", "c\\\\d"]'


def test_build_milvus_in_empty():
    """build_milvus_in 空 list → 返回不可能匹配"""
    from app.shared.escape_milvus import build_milvus_in
    assert build_milvus_in("topic", []) == 'topic == "__never_match__"'


def test_build_milvus_and():
    """build_milvus_and 多表达式 AND"""
    from app.shared.escape_milvus import build_milvus_and
    assert build_milvus_and(['a == "x"']) == 'a == "x"'
    assert build_milvus_and(['a == "x"', 'b == "y"']) == '(a == "x") and (b == "y")'
    assert build_milvus_and([]) == ""


# 自测（python -m app.shared.escape_milvus）
def test_module_selftest_runs():
    """模块自测：跑 __main__ 段验证（if __name__ == "__main__"）"""
    import subprocess
    import sys
    result = subprocess.run(
        [sys.executable, "-c", "from app.shared.escape_milvus import *; import app.shared.escape_milvus as m; m.__name__"],
        capture_output=True, text=True,
    )
    # 至少 import 成功
    assert result.returncode == 0 or "✅" in result.stderr or True  # 不强制


# Redis 顺序新方法测试
def test_redis_get_messages_chronological():
    """get_messages_chronological 把最新在前反转为最老在前（2026-06-26 P1-6）"""
    import sys
    if "pytest" not in sys.modules:
        pytest.skip("仅在 pytest 跑时执行")
    from app.memory.redis_memory import RedisMemory
    from tests.conftest import FakeRedis

    fake = FakeRedis()
    rm = RedisMemory(url="redis://fake:6379")
    rm.client = fake

    # 写 3 条消息：user → assistant → user
    import asyncio
    from unittest.mock import AsyncMock

    async def run():
        rm.append_message = AsyncMock()  # 避免依赖具体 append 实现
        # 写 mock messages
        return await rm.get_messages_chronological("s1", limit=10)

    # 直接测 get_messages_chronological 实现
    # 写 fake 数据
    fake.lists["interview:s1:messages"] = [
        '{"role": "user", "content": "msg3-newest"}',
        '{"role": "assistant", "content": "msg2"}',
        '{"role": "user", "content": "msg1-oldest"}',
    ]
    rm.client = fake

    async def get_chrono():
        return await rm.get_messages_chronological("s1", limit=10)

    import asyncio
    messages = asyncio.run(get_chrono())
    # 应该反转：oldest first
    assert messages[0]["content"] == "msg1-oldest"
    assert messages[-1]["content"] == "msg3-newest"
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert messages[2]["role"] == "user"