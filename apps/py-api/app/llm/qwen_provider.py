"""Qwen / DashScope LLM Provider（OpenAI 兼容层）"""
from openai import AsyncOpenAI
from typing import List, Dict, Optional


class QwenProvider:
    """Qwen via DashScope OpenAI 兼容层"""

    def __init__(self, api_key: str, base_url: str, model_name: str = "qwen-plus"):
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model_name = model_name

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> str:
        """简单非流式对话（对齐 NestJS LlmGatewayService.chat）"""
        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    async def stream(self, messages: List[Dict[str, str]]):
        """流式输出（用于 SSE）"""
        stream = await self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content