"""Milvus 字符串转义工具 · 2026-06-26

修复：milvus_memory.py 之前用 f-string 直接拼 user_id 到 filter 表达式：
    expr=f'user_id == "{user_id}"'
如果 user_id 含 " 或 \，可注入任意 filter 表达式（SQL 注入式攻击）。

Milvus filter 表达式支持的特殊字符：
- 双引号 " 用于包裹字符串字面量
- 反斜杠 \ 用于转义
- 反斜杠在 filter 里要写两个 \\\\

修复：用 escape_milvus_string 函数转义 user_id 等字符串字段。
对齐 NestJS 版 apps/api/src/shared/escape-milvus.util.ts。
"""



def escape_milvus_string(value: str) -> str:
    """转义 Milvus filter 表达式中的字符串字面量

    规则：
    - 反斜杠 \ → \\\\
    - 双引号 " → \"

    Milvus 表达式参考：
    - 标准字段过滤：user_id == "abc"
    - 转义后字段：user_id == "ab\\\"c" （原始 ab\\"c → 转义 ab\\\\\\\"c）

    注意：必须在用 f-string 拼到 filter 表达式之前先调用此函数。
    """
    if value is None:
        return ""
    # 反斜杠先转义（在双引号之前）
    escaped = value.replace("\\", "\\\\")
    # 双引号转义
    escaped = escaped.replace('"', '\\"')
    return escaped


def build_milvus_eq(field: str, value: str) -> str:
    """构造等值过滤表达式（推荐用这个，不要手写 f-string）

    例：
        build_milvus_eq("user_id", "abc")  → 'user_id == "abc"'
        build_milvus_eq("user_id", 'a"b')  → 'user_id == "a\\"b"'
    """
    escaped = escape_milvus_string(value)
    return f'{field} == "{escaped}"'


def build_milvus_in(field: str, values: list[str]) -> str:
    """构造 IN 过滤表达式

    例：
        build_milvus_in("topic", ["Agent", "RAG"])
        → 'topic in ["Agent", "RAG"]'
    """
    if not values:
        # 空 IN 永远不匹配，返回一个不可能的过滤
        return f'{field} == "__never_match__"'
    escaped_values = [escape_milvus_string(v) for v in values]
    quoted = ", ".join('"' + v + '"' for v in escaped_values)
    return f'{field} in [{quoted}]'


def build_milvus_and(exprs: list[str]) -> str:
    """多个过滤表达式用 AND 连接"""
    if not exprs:
        return ""
    if len(exprs) == 1:
        return exprs[0]
    return " and ".join(f"({e})" for e in exprs)


# 单元测试可在此运行：python -c "from app.shared.escape_milvus import escape_milvus_string; print(escape_milvus_string('a\\\"b'))"
if __name__ == "__main__":
    # 自测：转义不会破坏合法字符
    assert escape_milvus_string("abc") == "abc"
    assert escape_milvus_string("a-b_c.d") == "a-b_c.d"
    # 转义反斜杠
    assert escape_milvus_string("a\\b") == "a\\\\b"
    # 转义双引号
    assert escape_milvus_string('a"b') == 'a\\"b'
    # 同时有
    assert escape_milvus_string('a\\"b') == 'a\\\\\\"b'
    # 空字符串
    assert escape_milvus_string("") == ""
    # None
    assert escape_milvus_string(None) == ""
    # build_milvus_eq
    assert build_milvus_eq("user_id", "abc") == 'user_id == "abc"'
    assert build_milvus_eq("user_id", 'a"b') == 'user_id == "a\\"b"'
    # 注入测试：user_id = 'abc" or "1" == "1' 应该被转义成单条字符串字面量
    injection = 'abc" or "1" == "1'
    escaped = escape_milvus_string(injection)
    assert '"' not in escaped.replace('\\"', '', 1)  # 只有转义后的 \"
    expr = build_milvus_eq("user_id", injection)
    # 表达式应该把整个字符串当成一个 user_id 字面量
    assert expr.count('"') == 2  # 只有开闭引号
    print("✅ escape_milvus_string 自测全过")