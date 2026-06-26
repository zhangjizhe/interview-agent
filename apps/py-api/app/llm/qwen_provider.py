"""Qwen / DashScope LLM Provider（OpenAI 兼容层）

2026-06-26 商用 best practice：
- 重试 + 降级（tenacity 指数退避）
- 超时控制（asyncio.wait_for + httpx 默认 timeout）
- 结构化日志（structlog）
- 商用 fail-fast：API Key 缺失启动前报错（config.py 已做）
"""
import asyncio
import structlog
import time
from openai import AsyncOpenAI, APIError, APITimeoutError, RateLimitError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from typing import List, Dict

from app.core.exceptions import ExternalServiceError
from app.core.metrics import record_llm_call

logger = structlog.get_logger(__name__)

# 商用配置：超时 + 重试
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_MIN_WAIT = 1  # 指数退避起始（秒）
DEFAULT_RETRY_MAX_WAIT = 10  # 指数退避上限（秒）


class QwenProvider:
    """Qwen via DashScope OpenAI 兼容层

    重试策略：指数退避 1s → 2s → 4s（max wait 10s），最多 3 次
    重试触发：RateLimitError / APITimeoutError / APIError（5xx）
    不重试：APIError（4xx，如 401/403/422 业务错误）
    """

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model_name: str = "qwen-plus",
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ):
        if not api_key:
            raise ExternalServiceError(
                "QWEN_API_KEY is empty. Set it in .env before starting the server.",
                service="qwen",
                status_code=503,
            )
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            max_retries=0,  # 我们用 tenacity 自己重试，避免双重重试
        )
        self.model_name = model_name
        self.timeout = timeout
        self.max_retries = max_retries

    def _should_retry(self, exception: Exception) -> bool:
        """判断异常是否值得重试"""
        if isinstance(exception, RateLimitError):
            return True  # 429
        if isinstance(exception, APITimeoutError):
            return True  # 超时
        if isinstance(exception, APIError):
            # 5xx 服务端错误重试，4xx 客户端错误不重试
            return 500 <= getattr(exception, "status_code", 500) < 600
        if isinstance(exception, (asyncio.TimeoutError, ConnectionError)):
            return True
        return False

    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> str:
        """简单非流式对话（对齐 NestJS LlmGatewayService.chat）

        2026-06-26 商用：
        - tenacity 重试（指数退避 1/2/4s，最多 3 次）
        - asyncio.wait_for 超时控制
        - 结构化日志：每次调用 + 每次重试都记录
        """
        attempt_count = {"n": 0}
        call_start = time.perf_counter()

        @retry(
            stop=stop_after_attempt(self.max_retries),
            wait=wait_exponential(
                multiplier=1, min=DEFAULT_RETRY_MIN_WAIT, max=DEFAULT_RETRY_MAX_WAIT
            ),
            retry=retry_if_exception_type((RateLimitError, APITimeoutError, APIError, asyncio.TimeoutError, ConnectionError)),
            before_sleep=lambda retry_state: logger.warning(
                "qwen_retry",
                attempt=retry_state.attempt_number,
                next_sleep=retry_state.idle_for,
                error=str(retry_state.outcome.exception()),
            ),
            reraise=True,
        )
        async def _do_chat() -> str:
            attempt_count["n"] += 1
            try:
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=self.model_name,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    ),
                    timeout=self.timeout,
                )
                content = response.choices[0].message.content or ""
                prompt_tokens = response.usage.prompt_tokens if response.usage else None
                completion_tokens = response.usage.completion_tokens if response.usage else None
                # Prometheus metrics（成功调用）
                record_llm_call(
                    provider="qwen",
                    model=self.model_name,
                    status="success",
                    duration_seconds=time.perf_counter() - call_start,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
                if attempt_count["n"] > 1:
                    logger.info("qwen_chat_recovered", attempt=attempt_count["n"])
                else:
                    logger.debug(
                        "qwen_chat_ok",
                        model=self.model_name,
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                    )
                return content
            except Exception as e:
                if not self._should_retry(e):
                    # Prometheus metrics（非可重试错误）
                    record_llm_call(
                        provider="qwen",
                        model=self.model_name,
                        status="error",
                        duration_seconds=time.perf_counter() - call_start,
                    )
                    logger.error("qwen_chat_non_retryable", error=str(e), error_type=type(e).__name__)
                    raise ExternalServiceError(
                        f"Qwen API error: {e}",
                        service="qwen",
                        status_code=502,
                    ) from e
                raise

        try:
            return await _do_chat()
        except (RateLimitError, APITimeoutError, APIError, asyncio.TimeoutError, ConnectionError) as e:
            # Prometheus metrics（重试耗尽）
            record_llm_call(
                provider="qwen",
                model=self.model_name,
                status="timeout" if isinstance(e, (APITimeoutError, asyncio.TimeoutError)) else "error",
                duration_seconds=time.perf_counter() - call_start,
            )
            logger.error("qwen_chat_exhausted_retries", attempts=attempt_count["n"], error=str(e))
            raise ExternalServiceError(
                f"Qwen API failed after {attempt_count['n']} retries: {e}",
                service="qwen",
                status_code=503,
            ) from e

    async def stream(self, messages: List[Dict[str, str]]):
        """流式输出（用于 SSE）

        2026-06-26 商用：超时控制（不重试，因为流式不适合重试整段）
        """
        try:
            stream = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    stream=True,
                ),
                timeout=self.timeout,
            )
        except asyncio.TimeoutError as e:
            raise ExternalServiceError(
                f"Qwen stream timeout after {self.timeout}s",
                service="qwen",
                status_code=504,
            ) from e

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content