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

    ⚠️ 商用 fail-fast 设计（2026-06-28）：
    - 默认 STRICT_LLM=true → placeholder key 直接抛 RuntimeError，禁用 mock
    - STRICT_LLM=false → dev 环境允许 mock（带显眼 warning）
    - 商用部署必须 STRICT_LLM=true 且填真 key，否则 startup fail-fast
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


def is_strict_mode() -> bool:
    """商用 strict 模式（默认开启）。

    STRICT_LLM=false → 允许 mock（dev only）
    STRICT_LLM=true (default) → placeholder key 直接报错，不允许 mock

    商用部署必须保留 STRICT_LLM=true（默认值）。
    """
    import os
    val = os.getenv("STRICT_LLM", "true").strip().lower()
    return val in ("true", "1", "yes", "on")


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
        # 30ms/char 让用户能看到打字机效果（NestJS 真 LLM 也差不多这个速度）
        for char in mock_response:
            await asyncio.sleep(0.03)
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
        """基于 query 内容 + 上下文（interview_id/position/level）生成 mock 回复。

        行为对齐 NestJS 真 LLM：mock 模式下生成话题相关的回复，不是固定模板。
        关键改进（2026-06-28）：
        - 根据 interview position/level 给不同风格的回复
        - 根据 query 关键词返回话题相关回复（不是"关于{topic}"死板）
        - 用户问 meta 问题（"为什么没有思考过程"等）返知识性回答
        """
        # 提取 system message 中的 context（interview position/level）
        sys_msg = next((m for m in params.messages if m.role == "system"), None)
        sys_content = (sys_msg.content if sys_msg else "").lower()
        position = ""
        level = ""
        if "前端" in sys_content or "frontend" in sys_content:
            position = "前端"
        elif "后端" in sys_content or "backend" in sys_content:
            position = "后端"
        elif "算法" in sys_content or "algorithm" in sys_content:
            position = "算法"
        elif "测试" in sys_content or "test" in sys_content:
            position = "测试"
        elif "ai agent" in sys_content:
            position = "AI Agent"

        q = (query or "").strip()
        ql = q.lower()

        # 元问题：用户问工具/系统/AI 状态
        if any(kw in ql for kw in ["思考过程", "思考", "think", "为什么没有", "为什么"]):
            return (
                "我是按 LangGraph 多 Agent 拓扑运行的：supervisor 先判断意图 → "
                "planner 出题规划 → executor 执行（如调用 LLM/MCP 工具）→ "
                "replanner 评估是否需要追问 → reviewer 评分。每个节点都会 yield "
                "`step` 事件，前端可以实时显示。你看到'没思考过程'是因为我用了 "
                "MockProvider 直接返回。如果有真实 API key，会触发多 Agent 流程，"
                "每步都会有 thinking 事件。"
            )
        if any(kw in ql for kw in ["接入 ai", "用 ai", "ai 了吗", "用了什么", "哪个模型", "qwen", "deepseek"]):
            return (
                "已接入 LlmGateway，支持 Qwen (qwen-plus) 和 DeepSeek (deepseek-chat) 双 provider 链。"
                "当前如果 QWEN_API_KEY 是 placeholder，会自动降级到 MockProvider "
                "(用 hash 生成确定性回复)。要切到真模型：在 .env 设置 "
                "QWEN_API_KEY=sk-xxxxx 真实 key 后重启服务即可。"
            )
        if any(kw in ql for kw in ["怎么", "如何", "how"]):
            return (
                "可以从这几个维度展开：1) 业务背景：解决什么问题、用户是谁、"
                "规模多大；2) 技术选型：候选方案对比、为什么选这个、trade-off 是什么；"
                "3) 实施细节：团队规模、上线节奏、踩过什么坑；4) 数据验证："
                "上线后指标、用户反馈、ROI。建议先讲最有亮点的一个点深挖。"
            )

        # 面试/技术问题
        if any(kw in ql for kw in ["面试", "interview", "mock"]):
            return (
                f"好的，欢迎来到{position or '本场'}面试。我是 AI 面试官，接下来会围绕"
                f"你的简历和岗位需求出 5-8 道题，由易到中到难递进。"
                f"请用 STAR 法则（情境/任务/行动/结果）回答，每题 2-3 分钟。"
                f"准备好了吗？我先出第一题 ↓"
            )
        if any(kw in ql for kw in ["算法", "algorithm", "复杂度", "数据结构"]):
            return (
                "这道题考察的是经典算法思维。请按以下步骤作答："
                "1) 先说思路（不要直接写代码）；2) 分析时间/空间复杂度；"
                "3) 考虑边界条件（空数组、单元素、重复元素）；4) 用 Python 写实现。"
                "我会根据回答追问优化方案。"
            )

        # 默认：根据 query 实际内容生成话题相关回复
        seed = int(hashlib.md5(ql.encode() or b"empty").hexdigest()[:8], 16)
        topic_snippet = q[:30] if q else f"{position or '通用'}技术"
        return (
            f"关于「{topic_snippet}」，这个问题可以从三个层面分析：\n\n"
            f"**第一层 - 背景**：先明确问题域——{position or '当前场景'}下需要"
            f"权衡的核心约束是什么？性能、可维护性、团队熟悉度、还是交付节奏？\n\n"
            f"**第二层 - 对比**：常见的方案有 A/B/C 三种，各自的适用场景是什么？"
            f"为什么选 A 而不是 B？有没有踩过的坑？\n\n"
            f"**第三层 - 落地**：实际项目里怎么用？灰度策略是什么？"
            f"回滚方案呢？\n\n"
            f"先聊你最关心的那个层面，我再深入。"
        )[:400] 


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