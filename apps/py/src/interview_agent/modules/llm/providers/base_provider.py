"""Provider 基类 + Mock Provider — 与 NestJS BaseLLMProvider 像素级对齐。

注意：当 API Key 是 placeholder（如 'sk-placeholder'）时，QwenProvider/DeepseekProvider
自动降级到 MockProvider，避免开发环境无 key 时跑测试炸掉。生产环境填真 key 后走真路径。
"""
import asyncio
import hashlib
import os
from abc import ABC, abstractmethod

from interview_agent.modules.llm.providers.types import (
    ChatParams,
    ChatResponse,
    StreamChunk,
)


class BaseLLMProvider(ABC):
    """Provider 抽象基类。"""

    name: str
    default_model: str

    @abstractmethod
    async def chat(self, params: ChatParams) -> ChatResponse:
        ...

    @abstractmethod
    async def stream_chat(self, params: ChatParams):
        """AsyncGenerator[StreamChunk]"""
        ...

    def count_tokens(self, text: str) -> int:
        """粗略估算 token：英文 1 token ≈ 4 字符，中文 1 token ≈ 1.5 字符。
        与 NestJS BaseLLMProvider.countTokens 行为一致。
        """
        if not text:
            return 0
        en = sum(1 for c in text if c.isascii() and c.isalpha())
        return max(1, (en // 4) + ((len(text) - en) // 1.5))


def _is_placeholder_key(api_key: str | None) -> bool:
    """检测 API key 是否是 dev placeholder。

    判定规则：未设 / 空 / 含 'placeholder' / 长度 < 20 → 占位。
    """
    if not api_key:
        return True
    k = api_key.strip()
    if not k:
        return True
    if "placeholder" in k.lower():
        return True
    if len(k) < 20:
        return True
    return False


class MockProvider(BaseLLMProvider):
    """Mock Provider — 无真实 key 时返回模拟回复。

    用于：
    - 开发环境无 QWEN_API_KEY 时跑通测试
    - CI 环境不需要真 LLM 调用
    - 离线开发

    回复生成：基于输入 message 的 hash 生成确定性的模拟文本。
    """

    name: str
    default_model: str

    def __init__(self, name: str, default_model: str):
        self.name = name
        self.default_model = default_model

    async def chat(self, params: ChatParams) -> ChatResponse:
        await asyncio.sleep(0.05)  # 模拟网络延迟
        last_user = next(
            (m for m in reversed(params.messages) if m.role == "user"),
            None,
        )
        query = last_user.content if last_user else ""
        mock_response = self._generate_mock_response(query, params)
        return ChatResponse(
            content=mock_response,
            usage={
                "promptTokens": self.count_tokens(
                    "\n".join(m.content for m in params.messages)
                ),
                "completionTokens": self.count_tokens(mock_response),
            },
            finish_reason="stop",
            model=f"mock-{self.default_model}",
        )

    async def stream_chat(self, params: ChatParams):
        last_user = next(
            (m for m in reversed(params.messages) if m.role == "user"),
            None,
        )
        query = last_user.content if last_user else ""
        mock_response = self._generate_mock_response(query, params)

        # 字符级流式（与 NestJS 真流式行为一致）
        for char in mock_response:
            await asyncio.sleep(0.005)
            yield StreamChunk(content=char)
        yield StreamChunk(
            finish_reason="stop",
            usage={
                "promptTokens": self.count_tokens(
                    "\n".join(m.content for m in params.messages)
                ),
                "completionTokens": self.count_tokens(mock_response),
            },
        )

    def _generate_mock_response(self, query: str, params: ChatParams) -> str:
        """基于 query 哈希生成确定性 mock 回复。

        行为对齐 NestJS 真 LLM：简短回复，约 50-100 字。
        """
        # 根据 query 长度 + hash 生成回复长度
        seed = int(hashlib.md5(query.encode()).hexdigest()[:8], 16)
        length = 40 + (seed % 60)
        # 如果 query 含 '面试'/'interview' → 模拟面试官回复
        if any(kw in query.lower() for kw in ["面试", "interview"]):
            template = (
                "感谢您的回答。基于您的描述，我看到您在{topic}方面有相关经验。"
                "能否详细说明一下您在{topic}中最具挑战性的项目，以及您是如何解决的？"
                "请结合具体技术栈、团队规模、上线结果来阐述。"
            )
        elif any(kw in query.lower() for kw in ["算法", "algorithm"]):
            template = (
                "这是一个经典的算法问题。解题思路：1) 分析时间/空间复杂度要求；"
                "2) 考虑边界条件；3) 选择合适的数据结构。"
                "对于{topic}，推荐使用双指针 / 哈希表 / DP 等技巧。"
                "请用 Python 实现并说明思路。"
            )
        else:
            template = (
                "好的，我理解您的问题。关于{topic}，我建议从以下几个角度分析："
                "1) 业务背景与约束；2) 技术选型对比；3) 性能与可维护性权衡。"
                "请问您最关注哪个方面？"
            )

        topic = query[:20] if query else "通用技术"
        return template.format(topic=topic)[:length]


def create_provider(
    name: str,
    api_key: str,
    base_url: str,
    default_model: str,
) -> BaseLLMProvider:
    """工厂方法：依据 API key 是否占位选择真 provider 或 mock provider。"""
    if _is_placeholder_key(api_key):
        return MockProvider(name=name, default_model=default_model)

    # 真 provider（Qwen / DeepSeek 都用 OpenAI 兼容协议）
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    return _OpenAICompatProvider(
        name=name, default_model=default_model, client=client
    )


class _OpenAICompatProvider(BaseLLMProvider):
    """OpenAI 兼容 provider（Qwen / DeepSeek 都走这个）。"""

    def __init__(self, name: str, default_model: str, client):
        self.name = name
        self.default_model = default_model
        self._client = client

    async def chat(self, params: ChatParams) -> ChatResponse:
        extra_body: dict = {}
        if hasattr(params, "_prompt_cache_key"):
            extra_body["prompt_cache_key"] = params._prompt_cache_key
            extra_body["user"] = params._prompt_cache_key

        messages_dict = [m.to_dict() for m in params.messages]
        cacheable_indices = getattr(params, "_cacheable_indices", [])
        if cacheable_indices:
            for i in cacheable_indices:
                if i < len(messages_dict) and isinstance(messages_dict[i]["content"], str):
                    messages_dict[i] = {
                        **messages_dict[i],
                        "content": [
                            {
                                "type": "text",
                                "text": messages_dict[i]["content"],
                                "cache_control": {"type": "ephemeral"},
                            }
                        ],
                    }

        kwargs: dict = {
            "model": self.default_model,
            "messages": messages_dict,
            "temperature": params.temperature if params.temperature is not None else 0.7,
            "max_tokens": params.max_tokens,
            "stream": False,
        }
        if params.tools:
            kwargs["tools"] = params.tools
        if params.tool_choice:
            kwargs["tool_choice"] = params.tool_choice
        if extra_body:
            kwargs["extra_body"] = extra_body

        response = await self._client.chat.completions.create(**kwargs)
        choice = response.choices[0]
        usage = response.usage
        return ChatResponse(
            content=choice.message.content or "",
            usage={
                "promptTokens": usage.prompt_tokens if usage else 0,
                "completionTokens": usage.completion_tokens if usage else 0,
            },
            finish_reason=choice.finish_reason or "stop",
            model=response.model,
        )

    async def stream_chat(self, params: ChatParams):
        extra_body: dict = {}
        if hasattr(params, "_prompt_cache_key"):
            extra_body["prompt_cache_key"] = params._prompt_cache_key

        kwargs: dict = {
            "model": self.default_model,
            "messages": [m.to_dict() for m in params.messages],
            "temperature": params.temperature if params.temperature is not None else 0.7,
            "max_tokens": params.max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if extra_body:
            kwargs["extra_body"] = extra_body

        stream = await self._client.chat.completions.create(**kwargs)
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield StreamChunk(content=delta.content)
            if chunk.choices and chunk.choices[0].finish_reason:
                yield StreamChunk(finish_reason=chunk.choices[0].finish_reason)
            if chunk.usage:
                yield StreamChunk(
                    usage={
                        "promptTokens": chunk.usage.prompt_tokens,
                        "completionTokens": chunk.usage.completion_tokens,
                    }
                )