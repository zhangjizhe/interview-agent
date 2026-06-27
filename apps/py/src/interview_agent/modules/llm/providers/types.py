"""LLM Provider 数据类型 — 与 NestJS providers/types.ts 像素级对齐。"""

from typing import Any, Literal

# ============================================================
# 数据结构
# ============================================================


class ChatMessage:
    """单条消息。"""

    __slots__ = ("role", "content", "name", "tool_call_id")

    def __init__(
        self,
        role: Literal["system", "user", "assistant", "tool"],
        content: str,
        name: str | None = None,
        tool_call_id: str | None = None,
    ):
        self.role = role
        self.content = content
        self.name = name
        self.tool_call_id = tool_call_id

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"role": self.role, "content": self.content}
        if self.name:
            d["name"] = self.name
        if self.tool_call_id:
            d["tool_call_id"] = self.tool_call_id
        return d


class ChatParams:
    """LLM 调用参数。"""

    def __init__(
        self,
        messages: list[ChatMessage],
        temperature: float | None = None,
        max_tokens: int | None = None,
        stream: bool = False,
        tools: list[dict] | None = None,
        tool_choice: Literal["auto", "none", "required"] | None = None,
        trace_id: str | None = None,
    ):
        self.messages = messages
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.stream = stream
        self.tools = tools
        self.tool_choice = tool_choice
        self.trace_id = trace_id


class StreamChunk:
    """流式 chunk。"""

    def __init__(
        self,
        content: str | None = None,
        finish_reason: Literal["stop", "length", "tool_calls", "error"] | None = None,
        usage: dict | None = None,
        tool_call: dict | None = None,
        is_fallback_marker: bool = False,
    ):
        self.content = content
        self.finish_reason = finish_reason
        self.usage = usage
        self.tool_call = tool_call
        self.is_fallback_marker = is_fallback_marker

    def to_dict(self) -> dict:
        d: dict[str, Any] = {}
        if self.content is not None:
            d["content"] = self.content
        if self.finish_reason:
            d["finishReason"] = self.finish_reason
        if self.usage:
            d["usage"] = self.usage
        if self.tool_call:
            d["toolCall"] = self.tool_call
        if self.is_fallback_marker:
            d["isFallbackMarker"] = True
        return d


class ChatResponse:
    """非流式响应。"""

    def __init__(
        self,
        content: str,
        usage: dict,  # {"promptTokens": int, "completionTokens": int}
        finish_reason: str,
        model: str,
    ):
        self.content = content
        self.usage = usage
        self.finish_reason = finish_reason
        self.model = model

    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "usage": self.usage,
            "finishReason": self.finish_reason,
            "model": self.model,
        }


LLMProviderName = Literal["qwen", "deepseek"]