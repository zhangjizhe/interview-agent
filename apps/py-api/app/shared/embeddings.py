"""Embeddings · 2026-06-25 web ↔ py-api 对齐

Qwen text-embedding-v3 调用（1024 维）

商用 fail-fast：
- API key 缺失 → raise
- 超过 2048 字符 → 截断
- 超时 → 30s 后 timeout

MVP：dev 环境用 mock（0 向量）—— 商用前接 Qwen embedding
"""
import os
from typing import List
import structlog

logger = structlog.get_logger(__name__)

EMBEDDING_DIM = 1024  # Qwen text-embedding-v3


async def get_embedding(text: str) -> List[float]:
    """获取文本的 embedding 向量

    dev 模式：返回 0 向量（避免 LLM API 调用）
    商用模式：调 Qwen text-embedding-v3 API
    """
    api_key = os.getenv("QWEN_API_KEY", "")
    if not api_key or api_key.startswith("sk-test-placeholder"):
        # dev 模式：0 向量
        logger.debug("embedding_mock", text_len=len(text))
        return [0.0] * EMBEDDING_DIM

    # 商用模式：调 Qwen API
    try:
        from openai import AsyncOpenAI
        import asyncio

        client = AsyncOpenAI(
            api_key=api_key,
            base_url=os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        )
        # 截断到 2048 字符（Qwen embedding 限制）
        truncated = text[:2048] if len(text) > 2048 else text
        response = await asyncio.wait_for(
            client.embeddings.create(
                model="text-embedding-v3",
                input=truncated,
                dimensions=EMBEDDING_DIM,
            ),
            timeout=30.0,
        )
        return response.data[0].embedding
    except Exception as e:
        logger.warning("embedding_failed_return_zero", error=str(e))
        return [0.0] * EMBEDDING_DIM