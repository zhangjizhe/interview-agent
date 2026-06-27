"""Qwen + DeepSeek Provider 工厂 + LLM Gateway — 与 NestJS LlmGatewayService 像素级对齐。

关键设计：
- 进程级 providerEnabled map（401/402/403/404 → permanent disable）
- 进程级 providerDisabledReason map（可观测）
- fallback map：qwen ↔ deepseek（5xx/429 → 切备用）
- 永久错 vs 临时错区分
- Mock 降级（key 是 placeholder 时）
"""
import logging
from typing import AsyncIterator

from interview_agent.config import settings
from interview_agent.modules.llm.providers.base_provider import (
    BaseLLMProvider,
    MockProvider,
    create_provider,
)
from interview_agent.modules.llm.providers.types import (
    ChatParams,
    ChatResponse,
    LLMProviderName,
    StreamChunk,
)

logger = logging.getLogger(__name__)


# ============================================================
# 永久错 / 临时错判定
# ============================================================

# 永久错：401/402/403/404 → disable provider，避免每次都打 fallback
PERMANENT_ERROR_CODES = {401, 402, 403, 404}


def _classify_error(err: Exception) -> tuple[bool, int | None, str]:
    """分类异常：(is_permanent, http_status, reason)。

    返回 (True, status, reason) 表示永久错。
    返回 (False, status, reason) 表示临时错（应走 fallback）。
    """
    status = getattr(err, "status_code", None) or getattr(err, "code", None)
    msg = str(err).lower()

    # OpenAI / httpx 风格的异常
    if status in PERMANENT_ERROR_CODES:
        return True, status, f"permanent error {status}"

    if status and 400 <= status < 500:
        # 其它 4xx 也当永久错（防 token 错误反复 retry）
        return True, status, f"client error {status}"

    # 5xx / 429 / 网络错误 → 临时
    if status and (status >= 500 or status == 429):
        return False, status, f"transient error {status}"

    # 兜底：网络错误 → 临时
    if "connect" in msg or "timeout" in msg or "refused" in msg:
        return False, None, "network error"

    # 默认按永久错处理（避免无脑 fallback 浪费 quota）
    return True, status, "unknown error (default permanent)"


# ============================================================
# Provider Registry
# ============================================================


class LlmGateway:
    """LLM Gateway 单例 — 与 NestJS LlmGatewayService 像素级等价。

    职责：
    1. 多模型路由（chat provider, stream_chat provider）
    2. 故障降级（permanent → disable；transient → fallback provider）
    3. 永久错检测（401/402/403/404 → disable）
    4. Token / 模型分发
    """

    _instance: "LlmGateway | None" = None

    def __init__(self):
        self._providers: dict[LLMProviderName, BaseLLMProvider] = {}
        self._fallback_map: dict[LLMProviderName, LLMProviderName] = {
            "qwen": "deepseek",
            "deepseek": "qwen",
        }
        # 进程级 provider 状态：401/403/404 后置为 false
        self._provider_enabled: dict[LLMProviderName, bool] = {
            "qwen": True,
            "deepseek": True,
        }
        # 永久错原因（用于可观测）
        self._provider_disabled_reason: dict[LLMProviderName, str] = {}
        self._init_providers()

    @classmethod
    def instance(cls) -> "LlmGateway":
        """单例访问（lifespan 启动时 init）。"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _init_providers(self) -> None:
        """初始化 providers（真 provider 或 mock 降级）。"""
        self._providers["qwen"] = create_provider(
            name="qwen",
            api_key=settings.QWEN_API_KEY,
            base_url=settings.QWEN_BASE_URL,
            default_model=settings.QWEN_MODEL,
        )
        self._providers["deepseek"] = create_provider(
            name="deepseek",
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL,
            default_model=settings.DEEPSEEK_MODEL,
        )

        for name, p in self._providers.items():
            kind = "MOCK" if isinstance(p, MockProvider) else "REAL"
            logger.info(f"  provider {name}: {kind} ({p.default_model})")

    # ============================================================
    # 状态管理（与 NestJS setProviderEnabled 等价）
    # ============================================================

    def is_enabled(self, name: LLMProviderName) -> bool:
        return self._provider_enabled.get(name, True)

    def set_enabled(self, name: LLMProviderName, enabled: bool) -> None:
        self._provider_enabled[name] = enabled
        if enabled:
            self._provider_disabled_reason.pop(name, None)

    def get_disabled_reason(self, name: LLMProviderName) -> str | None:
        return self._provider_disabled_reason.get(name)

    def list_status(self) -> dict:
        """对齐 NestJS 可观测需求：返回所有 provider 状态。"""
        return {
            name: {
                "enabled": self._provider_enabled[name],
                "disabledReason": self._provider_disabled_reason.get(name),
                "isMock": isinstance(self._providers[name], MockProvider),
                "model": self._providers[name].default_model,
            }
            for name in self._providers
        }

    # ============================================================
    # 路由
    # ============================================================

    def _pick_provider(self, name: LLMProviderName) -> BaseLLMProvider:
        """拿一个 enabled 的 provider；name 不可用时走 fallback。"""
        if self.is_enabled(name):
            return self._providers[name]
        # fallback
        fb = self._fallback_map[name]
        if self.is_enabled(fb):
            logger.warning(
                f"provider {name} disabled, fallback to {fb}: "
                f"{self._provider_disabled_reason.get(name)}"
            )
            return self._providers[fb]
        # 全废
        raise RuntimeError(
            f"All providers disabled: {name}={self._provider_disabled_reason.get(name)}, "
            f"{fb}={self._provider_disabled_reason.get(fb)}"
        )

    def _disable(self, name: LLMProviderName, reason: str) -> None:
        """永久错：disable provider。"""
        self._provider_enabled[name] = False
        self._provider_disabled_reason[name] = reason
        logger.error(f"provider {name} DISABLED: {reason}")

    # ============================================================
    # Chat（同步）
    # ============================================================

    async def chat(
        self,
        params: ChatParams,
        primary: LLMProviderName = "qwen",
    ) -> ChatResponse:
        """主 provider chat；permanent err → fallback；transient err → fallback。"""
        providers_to_try: list[LLMProviderName] = [primary]
        fb = self._fallback_map[primary]
        if fb != primary and self.is_enabled(fb):
            providers_to_try.append(fb)

        last_err: Exception | None = None
        for name in providers_to_try:
            provider = self._providers[name]
            try:
                resp = await provider.chat(params)
                if name != primary:
                    logger.info(f"chat fallback {primary} -> {name} succeeded")
                return resp
            except Exception as e:  # noqa: BLE001
                last_err = e
                is_perm, status, reason = _classify_error(e)
                logger.warning(
                    f"chat {name} failed (status={status}, perm={is_perm}): {e}"
                )
                if is_perm:
                    self._disable(name, reason)
                # 不论永久/临时，下一个 provider fallback 试

        # 全失败
        raise RuntimeError(
            f"All LLM providers failed (primary={primary}): {last_err}"
        )

    # ============================================================
    # Chat（流式）
    # ============================================================

    async def stream_chat(
        self,
        params: ChatParams,
        primary: LLMProviderName = "qwen",
    ) -> AsyncIterator[StreamChunk]:
        """流式 chat：primary → fallback。

        与 NestJS StreamChunk.isFallbackMarker 字段对齐：
        primary 失败切 fallback 时 yield 一个 marker 让消费者识别不连续。
        """
        providers_to_try: list[LLMProviderName] = [primary]
        fb = self._fallback_map[primary]
        if fb != primary and self.is_enabled(fb):
            providers_to_try.append(fb)

        for idx, name in enumerate(providers_to_try):
            provider = self._providers[name]
            try:
                # 第一个 chunk 之前如果切了 fallback，发 marker
                if idx > 0:
                    yield StreamChunk(is_fallback_marker=True)
                async for chunk in provider.stream_chat(params):
                    yield chunk
                return
            except Exception as e:  # noqa: BLE001
                is_perm, status, reason = _classify_error(e)
                logger.warning(
                    f"stream {name} failed (status={status}, perm={is_perm}): {e}"
                )
                if is_perm:
                    self._disable(name, reason)
                continue

        # 全部失败，发 error chunk
        yield StreamChunk(finish_reason="error")


def get_gateway() -> LlmGateway:
    """FastAPI Depends + 业务调用入口。"""
    return LlmGateway.instance()