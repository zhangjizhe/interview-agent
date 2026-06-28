"""end_interview 真 LLM 报告生成 E2E 测试（2026-06-28）。

通过 httpx.AsyncClient + ASGITransport 直接调 /api/interview/{id}/end，
mock get_gateway 返回不同 LLM 响应，验证 4 个分支：
1. LLM 纯 JSON 成功 → 真实 report
2. LLM ```json 包裹 → 正则提取
3. LLM 非 JSON → fallback
4. LLM 抛异常 → fallback

⚠️ 必须用 httpx.ASGITransport(app=app) 而非 TestClient：
   TestClient 内部 lifespan 跑 sync 上下文，function-scope 测试用 pytest-asyncio
   的 loop 跑 async 函数会撞 "attached to a different loop"。
   httpx AsyncClient + ASGITransport 在 pytest-asyncio loop 内跑 startup，
   所有 async 业务函数都在同一个 loop。

pytest tests/test_end_interview_llm.py -v
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

# 确保 src 在 sys.path（对齐 tests/test_all_phases.py L17-18）
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport

from interview_agent.main import app
from interview_agent.infra.redis_client import init_redis, close_redis
from interview_agent.infra.db import init_db, close_db


@pytest_asyncio.fixture(scope="function")
async def http_client():
    """httpx AsyncClient + ASGITransport：直接走 FastAPI app，无 TestClient event loop 冲突。

    ⚠️ ASGITransport 不触发 lifespan，所以手动 init_redis + init_db。
    """
    await init_db()
    await init_redis()
    async with httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    await close_redis()
    await close_db()


async def _seed_interview_with_messages(http_client: httpx.AsyncClient, label: str):
    """通过 HTTP 端点：login → upload-resume → start → message (写 messages)。

    返回 (interview_id, jwt) — interview_id 是后端生成的 cuid，不是传进去的 label。
    """
    user_id = f"llm-test-{label}"
    # 登录
    login = await http_client.post(
        "/api/auth/login", json={"userId": user_id}
    )
    assert login.status_code == 200, login.text
    jwt = login.json()["accessToken"]
    headers = {"Authorization": f"Bearer {jwt}"}

    # upload
    with open("/tmp/test.pdf", "rb") as f:
        upload = await http_client.post(
            "/api/interview/upload-resume",
            headers=headers,
            data={"position": "前端架构师", "userId": user_id},
            files={"file": ("test.pdf", f, "application/pdf")},
        )
    assert upload.status_code == 200, upload.text

    # start
    start = await http_client.post(
        "/api/interview/start",
        headers=headers,
        json={
            "user_id": user_id,
            "position": "前端架构师",
            "user_role": "前端架构师",
            "interview_type": "comprehensive",
            "difficulty": "senior",
        },
    )
    assert start.status_code == 200, start.text
    real_id = start.json()["interviewId"]

    # 一轮 SSE 消息（写入 messages 表）
    msg = await http_client.post(
        f"/api/interview/{real_id}/message",
        headers=headers,
        json={"content": "我做过一个 SaaS 多租户系统，支撑 1 万企业。", "turn_number": 1},
        timeout=60,
    )
    assert msg.status_code == 200, msg.text
    return real_id, jwt


@pytest.mark.asyncio
async def test_end_llm_success_pure_json(http_client, monkeypatch):
    """场景 1：LLM 返回纯 JSON → 真实 report。"""
    interview_id, jwt = await _seed_interview_with_messages(
        http_client, "llm-test-success-pure"
    )
    headers = {"Authorization": f"Bearer {jwt}"}

    # Mock LLM Gateway
    fake_resp = MagicMock()
    fake_resp.content = json.dumps({
        "overallScore": 88,
        "scores": {"technical": 90, "communication": 85, "logic": 88, "learning": 89},
        "strengths": ["系统设计扎实", "表达清晰"],
        "weaknesses": ["边界条件待加强"],
        "suggestions": ["多刷分布式案例"],
    })
    fake_resp.usage = {"promptTokens": 1000, "completionTokens": 300}
    mock_gw = MagicMock()
    mock_gw.chat = AsyncMock(return_value=fake_resp)
    monkeypatch.setattr(
        "interview_agent.modules.interview.interview_controller.get_gateway",
        lambda: mock_gw,
    )

    end = await http_client.post(
        f"/api/interview/{interview_id}/end", headers=headers
    )
    assert end.status_code == 200, end.text
    body = end.json()
    assert body["status"] == "COMPLETED"
    assert body["report"]["overallScore"] == 88
    assert body["report"]["scores"]["technical"] == 90
    assert "系统设计扎实" in body["report"]["strengths"]


@pytest.mark.asyncio
async def test_end_llm_markdown_wrapped_json(http_client, monkeypatch):
    """场景 2：LLM 返回 ```json ... ``` 包裹 → 正则提取。"""
    interview_id, jwt = await _seed_interview_with_messages(
        http_client, "llm-test-md-wrap"
    )
    headers = {"Authorization": f"Bearer {jwt}"}

    fake_resp = MagicMock()
    fake_resp.content = """好的，以下是评估结果：

```json
{
  "overallScore": 72,
  "scores": {"technical": 75, "communication": 70, "logic": 72, "learning": 71},
  "strengths": ["亮点1"],
  "weaknesses": ["不足1"],
  "suggestions": ["建议1"]
}
```"""
    fake_resp.usage = {"promptTokens": 500, "completionTokens": 200}
    mock_gw = MagicMock()
    mock_gw.chat = AsyncMock(return_value=fake_resp)
    monkeypatch.setattr(
        "interview_agent.modules.interview.interview_controller.get_gateway",
        lambda: mock_gw,
    )

    end = await http_client.post(
        f"/api/interview/{interview_id}/end", headers=headers
    )
    assert end.status_code == 200, end.text
    body = end.json()
    assert body["report"]["overallScore"] == 72
    assert "亮点1" in body["report"]["strengths"]


@pytest.mark.asyncio
async def test_end_llm_invalid_json_fallback(http_client, monkeypatch):
    """场景 3：LLM 返回非 JSON → fallback 占位 report。"""
    interview_id, jwt = await _seed_interview_with_messages(
        http_client, "llm-test-bad-json"
    )
    headers = {"Authorization": f"Bearer {jwt}"}

    fake_resp = MagicMock()
    fake_resp.content = "模型生成失败，返回非 JSON 文本"
    fake_resp.usage = {"promptTokens": 0, "completionTokens": 0}
    mock_gw = MagicMock()
    mock_gw.chat = AsyncMock(return_value=fake_resp)
    monkeypatch.setattr(
        "interview_agent.modules.interview.interview_controller.get_gateway",
        lambda: mock_gw,
    )

    end = await http_client.post(
        f"/api/interview/{interview_id}/end", headers=headers
    )
    # 仍然 200，因为 fallback 保证 status=COMPLETED
    assert end.status_code == 200, end.text
    body = end.json()
    assert body["status"] == "COMPLETED"
    # fallback score=50
    assert body["report"]["overallScore"] == 50
    assert all(body["report"]["scores"][k] == 50 for k in ("technical", "communication", "logic", "learning"))
    assert "解析失败" in body["report"]["strengths"] or "JSON" in body["report"]["strengths"]


@pytest.mark.asyncio
async def test_end_llm_exception_fallback(http_client, monkeypatch):
    """场景 4：LLM gateway.chat() 抛异常 → fallback 占位 report。"""
    interview_id, jwt = await _seed_interview_with_messages(
        http_client, "llm-test-llm-down"
    )
    headers = {"Authorization": f"Bearer {jwt}"}

    mock_gw = MagicMock()
    mock_gw.chat = AsyncMock(
        side_effect=RuntimeError("All LLM providers failed (primary=qwen): 401 Unauthorized")
    )
    monkeypatch.setattr(
        "interview_agent.modules.interview.interview_controller.get_gateway",
        lambda: mock_gw,
    )

    end = await http_client.post(
        f"/api/interview/{interview_id}/end", headers=headers
    )
    assert end.status_code == 200, end.text
    body = end.json()
    assert body["status"] == "COMPLETED"
    assert body["report"]["overallScore"] == 50
    assert "评估生成失败" in body["report"]["strengths"] or "LLM" in body["report"]["strengths"]


@pytest.mark.asyncio
async def test_end_llm_score_clamp(http_client, monkeypatch):
    """场景 5：LLM 返回超界分数（>100 或 <0）→ clamp 到 [0, 100]。"""
    interview_id, jwt = await _seed_interview_with_messages(
        http_client, "llm-test-clamp"
    )
    headers = {"Authorization": f"Bearer {jwt}"}

    fake_resp = MagicMock()
    fake_resp.content = json.dumps({
        "overallScore": 150,  # 超界
        "scores": {"technical": -10, "communication": 200, "logic": 50, "learning": 50},
        "strengths": ["a"], "weaknesses": ["b"], "suggestions": ["c"],
    })
    fake_resp.usage = {"promptTokens": 1, "completionTokens": 1}
    mock_gw = MagicMock()
    mock_gw.chat = AsyncMock(return_value=fake_resp)
    monkeypatch.setattr(
        "interview_agent.modules.interview.interview_controller.get_gateway",
        lambda: mock_gw,
    )

    end = await http_client.post(
        f"/api/interview/{interview_id}/end", headers=headers
    )
    assert end.status_code == 200, end.text
    body = end.json()
    assert body["report"]["overallScore"] == 100  # clamp 到 100
    assert body["report"]["scores"]["technical"] == 0  # clamp 到 0
    assert body["report"]["scores"]["communication"] == 100  # clamp 到 100


@pytest.mark.asyncio
async def test_end_no_body_still_works(http_client, monkeypatch):
    """场景 6：前端不传 body（之前 422 bug fix）— 仍然跑 LLM 生成。"""
    interview_id, jwt = await _seed_interview_with_messages(
        http_client, "llm-test-no-body"
    )

    fake_resp = MagicMock()
    fake_resp.content = json.dumps({
        "overallScore": 70,
        "scores": {"technical": 70, "communication": 70, "logic": 70, "learning": 70},
        "strengths": ["x"], "weaknesses": ["y"], "suggestions": ["z"],
    })
    fake_resp.usage = {"promptTokens": 1, "completionTokens": 1}
    mock_gw = MagicMock()
    mock_gw.chat = AsyncMock(return_value=fake_resp)
    monkeypatch.setattr(
        "interview_agent.modules.interview.interview_controller.get_gateway",
        lambda: mock_gw,
    )

    # 无 body
    end = await http_client.post(
        f"/api/interview/{interview_id}/end",
        headers={"Authorization": f"Bearer {jwt}"},
    )
    assert end.status_code == 200, end.text
    body = end.json()
    assert body["status"] == "COMPLETED"
    assert body["report"]["overallScore"] == 70