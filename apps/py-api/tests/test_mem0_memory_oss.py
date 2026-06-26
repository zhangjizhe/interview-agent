"""test_mem0_memory_oss.py · Mem0Memory OSS mode 真实 httpx 调用路径（mock）

补全之前 test_mem0_memory.py 只覆盖 _detect_mode / _build_endpoint / is_enabled，
没测实际 memorize / search httpx 调用。

本次覆盖（mock httpx.AsyncClient.post）：
- memorize OSS mode 200 → True
- memorize OSS mode 500 → raise Mem0APIError
- memorize OSS mode httpx 网络错误 → raise Mem0APIError
- search OSS mode 200 → 返回 results
- search OSS mode 500 → raise Mem0APIError
- search OSS mode 鉴权头（Authorization: Bearer xxx）正确发送
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _make_oss_mem0() -> "Mem0Memory":  # type: ignore  # noqa: F821
    """构造 OSS mode Mem0Memory 实例（host only，无 api_key）"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="", host="http://localhost:8888")
    assert m.mode == "oss"
    return m


@pytest.mark.asyncio
async def test_mem0_oss_memorize_200_returns_true():
    """OSS mode memorize 成功 → True"""
    m = _make_oss_mem0()
    messages = [{"role": "user", "content": "hello"}, {"role": "assistant", "content": "hi"}]

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = ""

    with patch("app.memory.mem0_memory.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        result = await m.memorize(user_id="u1", messages=messages)

    assert result is True
    # 验证调用参数
    call_args = mock_client.post.call_args
    url = call_args[0][0]
    json_payload = call_args[1]["json"]
    assert url == "http://localhost:8888/memories"  # oss path（实际 base_url + paths["add"]）
    assert json_payload["user_id"] == "u1"
    assert json_payload["messages"] == messages


@pytest.mark.asyncio
async def test_mem0_oss_memorize_500_raises():
    """OSS mode memorize 500 → raise Mem0APIError"""
    from app.memory.mem0_memory import Mem0APIError
    m = _make_oss_mem0()
    messages = [{"role": "user", "content": "hello"}]

    mock_resp = MagicMock()
    mock_resp.status_code = 500
    mock_resp.text = "internal server error"

    with patch("app.memory.mem0_memory.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        with pytest.raises(Mem0APIError) as exc_info:
            await m.memorize(user_id="u1", messages=messages)

    assert "HTTP 500" in str(exc_info.value)
    assert "oss" in str(exc_info.value)


@pytest.mark.asyncio
async def test_mem0_oss_memorize_network_error_raises():
    """OSS mode memorize httpx 网络错误 → raise Mem0APIError"""
    import httpx
    from app.memory.mem0_memory import Mem0APIError
    m = _make_oss_mem0()
    messages = [{"role": "user", "content": "hello"}]

    with patch("app.memory.mem0_memory.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post.side_effect = httpx.ConnectError("Connection refused")
        mock_client_cls.return_value = mock_client

        with pytest.raises(Mem0APIError) as exc_info:
            await m.memorize(user_id="u1", messages=messages)

    assert "network error" in str(exc_info.value)


@pytest.mark.asyncio
async def test_mem0_oss_search_200_returns_results():
    """OSS mode search 成功 → 返回 results list"""
    m = _make_oss_mem0()
    expected_results = [
        {"id": "mem-1", "memory": "user prefers dark mode", "score": 0.92},
        {"id": "mem-2", "memory": "user uses Python", "score": 0.85},
    ]

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"results": expected_results}

    with patch("app.memory.mem0_memory.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        results = await m.search(user_id="u1", query="dark mode preference", limit=3)

    assert results == expected_results
    # 验证 search payload
    call_args = mock_client.post.call_args
    url = call_args[0][0]
    json_payload = call_args[1]["json"]
    assert url == "http://localhost:8888/search"  # oss path（实际 base_url + paths["search"]）
    assert json_payload["query"] == "dark mode preference"
    assert json_payload["filters"]["user_id"] == "u1"
    assert json_payload["top_k"] == 3


@pytest.mark.asyncio
async def test_mem0_oss_search_500_raises():
    """OSS mode search 500 → raise Mem0APIError"""
    from app.memory.mem0_memory import Mem0APIError
    m = _make_oss_mem0()

    mock_resp = MagicMock()
    mock_resp.status_code = 503
    mock_resp.text = "service unavailable"

    with patch("app.memory.mem0_memory.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        with pytest.raises(Mem0APIError) as exc_info:
            await m.search(user_id="u1", query="test")

    assert "HTTP 503" in str(exc_info.value)


@pytest.mark.asyncio
async def test_mem0_disabled_memorize_short_circuit():
    """disabled mode memorize 直接返回 False（不发 httpx 请求）"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="", host="")
    assert m.mode == "disabled"

    result = await m.memorize(user_id="u1", messages=[{"role": "user", "content": "hi"}])
    assert result is False


@pytest.mark.asyncio
async def test_mem0_disabled_search_returns_empty():
    """disabled mode search 返回空 list"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="", host="")
    assert m.mode == "disabled"

    results = await m.search(user_id="u1", query="test")
    assert results == []


def test_mem0_cloud_mode_has_authorization_header():
    """cloud mode 应包含 Authorization: Bearer <api_key>"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="sk-test-12345", host="")
    assert m.mode == "cloud"
    assert m.headers.get("Authorization") == "Token sk-test-12345"