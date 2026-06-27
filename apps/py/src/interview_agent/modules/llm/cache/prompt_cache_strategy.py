"""Prompt Cache 策略 — 与 NestJS prompt-cache.strategy.ts 像素级对齐（纯函数）。

关键能力：
- classifyMessages / classifyMessages3 — 3 段前缀识别
- buildPromptCacheContext — 构造 prompt_cache_key
- extractCacheUsage — 跨 provider 归一化 cachedTokens
- injectAnthropicCacheControl — Anthropic 协议注入
- estimateTokens / fnv1a / fingerprintToolset
"""


def fnv1a(s: str) -> int:
    """FNV-1a 32-bit hash（无 crypto 依赖）。与 NestJS 完全一致。"""
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) & 0xFFFFFFFF
    return h


def estimate_tokens(text: str) -> int:
    """估算 token：英文 1token≈4字 / 中文 1token≈1.5字。与 NestJS 完全一致。"""
    if not text:
        return 0
    en = sum(1 for c in text if c.isascii() and c.isalpha())
    return max(1, (en // 4) + ((len(text) - en) // 1.5))


def classify_messages(
    messages: list[dict],
) -> tuple[list[dict], list[int]]:
    """识别 SYSTEM 段（对齐 NestJS classifyMessages）。

    Returns:
        segments: [{kind, indices, hash, estimatedTokens}, ...]
        cacheable_indices: [int, ...] （SYSTEM 段所有索引）
    """
    sys_indices: list[int] = []
    dyn_indices: list[int] = []
    for i, m in enumerate(messages):
        role = m.get("role", "")
        if role == "system":
            sys_indices.append(i)
        else:
            dyn_indices.append(i)

    segments: list[dict] = []
    if sys_indices:
        segments.append(_build_segment("SYSTEM", sys_indices, messages))
    if dyn_indices:
        segments.append(_build_segment("DYNAMIC", dyn_indices, messages))

    cacheable_indices = [
        i for s in segments if s["kind"] == "SYSTEM" for i in s["indices"]
    ]
    return segments, cacheable_indices


def classify_messages_3(
    messages: list[dict],
    dyn_start: int = -1,
) -> tuple[list[dict], list[int]]:
    """3 段识别：SYSTEM / SEMI_STATIC / DYNAMIC（对齐 NestJS classifyMessages3）。

    SEMI_STATIC：dynStart 之前的非 system 消息（few-shot 用）
    DYNAMIC：dynStart 之后的所有消息

    Returns:
        segments, cacheable_indices （SYSTEM + 大于 1024 token 的 SEMI_STATIC）
    """
    if dyn_start < 0:
        for i, m in enumerate(messages):
            if m.get("role") != "system":
                dyn_start = i
                break
        else:
            dyn_start = len(messages)

    sys_indices: list[int] = []
    semi_indices: list[int] = []
    dyn_indices: list[int] = []
    for i, m in enumerate(messages):
        if i < dyn_start and m.get("role") == "system":
            sys_indices.append(i)
        elif i < dyn_start:
            semi_indices.append(i)
        else:
            dyn_indices.append(i)

    segments: list[dict] = []
    if sys_indices:
        segments.append(_build_segment("SYSTEM", sys_indices, messages))
    if semi_indices:
        segments.append(_build_segment("SEMI_STATIC", semi_indices, messages))
    if dyn_indices:
        segments.append(_build_segment("DYNAMIC", dyn_indices, messages))

    cacheable_indices = [
        i
        for s in segments
        if s["kind"] == "SYSTEM"
        or (s["kind"] == "SEMI_STATIC" and s["estimatedTokens"] >= 1024)
        for i in s["indices"]
    ]
    return segments, cacheable_indices


def _build_segment(kind: str, indices: list[int], messages: list[dict]) -> dict:
    text = "\n".join(messages[i].get("content", "") or "" for i in indices)
    return {
        "kind": kind,
        "indices": indices,
        "hash": format(fnv1a(text), "x"),
        "estimatedTokens": estimate_tokens(text),
    }


def fingerprint_toolset(tools: list[dict] | None) -> dict:
    """工具集指纹（对齐 NestJS fingerprintToolset）。"""
    if not tools:
        return {"signature": "<empty>", "hash": "0" * 16}
    sig = ",".join(sorted(t.get("function", {}).get("name", "") for t in tools))
    return {
        "signature": sig,
        "hash": format(fnv1a(f"v1::{sig}"), "x").zfill(16),
    }


def build_prompt_cache_context(
    user_id: str,
    system_version: str,
    messages: list[dict],
    tools: list[dict] | None = None,
    protocol: str = "openai_compat",
) -> dict:
    """构造 PromptCacheContext（对齐 NestJS buildPromptCacheContext）。

    Returns:
        {
            cacheKey, segments, promptCacheKey, protocol, cacheableIndices
        }
    """
    segments, cacheable_indices = classify_messages(messages)
    toolset = fingerprint_toolset(tools)
    prompt_cache_key = f"{user_id}::{system_version}::{toolset['hash']}"
    return {
        "cacheKey": prompt_cache_key,
        "segments": segments,
        "promptCacheKey": prompt_cache_key,
        "protocol": protocol,
        "cacheableIndices": cacheable_indices,
    }


def extract_cache_usage(raw_usage: dict | None) -> dict:
    """从 provider 响应提取缓存命中信息（对齐 NestJS extractCacheUsage）。"""
    if not raw_usage:
        return {"cachedTokens": 0, "totalPromptTokens": 0}

    # OpenAI / Qwen / DeepSeek: prompt_tokens_details.cached_tokens
    ptd = raw_usage.get("prompt_tokens_details") or {}
    oa_cached = ptd.get("cached_tokens")
    # Anthropic: cache_read_input_tokens
    ant_cached = raw_usage.get("cache_read_input_tokens")
    cached = 0
    if isinstance(oa_cached, (int, float)):
        cached = int(oa_cached)
    elif isinstance(ant_cached, (int, float)):
        cached = int(ant_cached)

    total = (
        raw_usage.get("prompt_tokens")
        or raw_usage.get("promptTokens")
        or raw_usage.get("input_tokens")
        or 0
    )
    return {"cachedTokens": int(cached), "totalPromptTokens": int(total)}


def inject_anthropic_cache_control(
    messages: list[dict],
    cacheable_indices: list[int],
) -> list[dict]:
    """给 Anthropic 协议 messages 注入 cache_control（对齐 NestJS 版本）。"""
    if not cacheable_indices:
        return messages
    out: list[dict] = []
    for i, m in enumerate(messages):
        if i not in cacheable_indices:
            out.append(m)
            continue
        content = m.get("content", "")
        if isinstance(content, str):
            out.append(
                {
                    **m,
                    "content": [
                        {
                            "type": "text",
                            "text": content,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                }
            )
        elif isinstance(content, list) and content:
            blocks = list(content)
            last = dict(blocks[-1])
            last["cache_control"] = {"type": "ephemeral"}
            blocks[-1] = last
            out.append({**m, "content": blocks})
        else:
            out.append(m)
    return out