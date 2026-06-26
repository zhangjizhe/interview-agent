"""test_mem0_memory.py · Mem0Memory cloud/oss/disabled 模式 + payload 格式

覆盖：
- _detect_mode 自动判断模式
- _build_endpoint 三种模式构造 base_url / paths / headers
- is_enabled 返回值
- search payload 包含 user_id filter
- memorize payload 不带 user_id 在顶层（user_id 在 body）
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def test_mem0_disabled_mode_when_no_creds():
    """无 api_key + 无 host → disabled 模式"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="", host="")
    assert m.mode == "disabled"
    assert m.is_enabled() is False


def test_mem0_cloud_mode_when_api_key():
    """有 api_key + 无 host → cloud 模式"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="test-key", host="")
    assert m.mode == "cloud"
    assert m.is_enabled() is True
    assert m.base_url == "https://api.mem0.ai"
    # Token prefix（不是 Bearer）
    assert m.headers["Authorization"] == "Token test-key"
    # cloud 模式用 v3 API
    assert "v3" in m.paths["add"]


def test_mem0_oss_mode_when_host():
    """有 host → oss 模式（无 api_key）"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="", host="http://localhost:8000")
    assert m.mode == "oss"
    assert m.is_enabled() is True
    assert m.base_url == "http://localhost:8000"
    # OSS 默认无 Authorization header（如果自托管需要 token，得另外配置）
    assert "Authorization" not in m.headers
    # oss 模式用 v1 API path
    assert m.paths["add"] == "/memories"


def test_mem0_oss_host_trailing_slash_stripped():
    """OSS host 末尾 / 自动去掉"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="", host="http://localhost:8000/")
    assert m.base_url == "http://localhost:8000"  # 无末尾 /


@pytest.mark.asyncio
async def test_mem0_search_payload_format():
    """search payload 包含 filters.user_id（Mem0 v3 API 格式）"""
    from app.memory.mem0_memory import Mem0Memory
    import httpx

    m = Mem0Memory(api_key="test-key", host="")
    # 模拟 httpx 返回
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"results": [{"memory": "test memory"}]}

    with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        await m.search(user_id="user-123", query="LangGraph", limit=3)
        # 检查 payload
        call_kwargs = mock_post.call_args.kwargs
        assert "json" in call_kwargs
        body = call_kwargs["json"]
        assert body["query"] == "LangGraph"
        assert body["filters"]["user_id"] == "user-123"
        assert body["top_k"] == 3


@pytest.mark.asyncio
async def test_mem0_memorize_disabled_returns_false():
    """disabled 模式下 memorize 直接返回 False（不调网络）"""
    from app.memory.mem0_memory import Mem0Memory
    m = Mem0Memory(api_key="", host="")
    result = await m.memorize(user_id="u", messages=[{"role": "user", "content": "x"}])
    assert result is False