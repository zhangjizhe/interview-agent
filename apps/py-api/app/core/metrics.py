"""Prometheus Metrics · 2026-06-26 商用 best practice

暴露 /api/metrics 给 Prometheus / Grafana 抓取，关键指标：
- request_total{method,path,status} - Counter：HTTP 请求总数
- request_duration_seconds{method,path} - Histogram：HTTP 请求耗时分布
- llm_calls_total{provider,model,status} - Counter：LLM 调用次数（按 provider/model/成败）
- llm_call_duration_seconds{provider,model} - Histogram：LLM 调用耗时分布
- llm_tokens_total{provider,model,type} - Counter：token 使用量（type=prompt|completion）
- llm_cost_usd_total{provider,model} - Counter：累计成本（美元）
- memory_ops_total{store,op,status} - Counter：存储操作（store=redis|milvus|qdrant|mem0, op=get|set|search|insert）
- memory_op_duration_seconds{store,op} - Histogram：存储操作耗时

采集方式：
- Prometheus 配置 scrape interval=15s
- Grafana 配置面板（推荐）：
  - 请求 QPS / P50 P95 P99 延迟
  - LLM 调用 QPS / 平均耗时 / 成本趋势
  - 存储命中率 / 慢查询

商用 checklist：
- metrics 端点本身不走应用层 limiter（让 prometheus 能频繁抓）
- 不在 metrics 端点暴露敏感信息（user_id / token）
"""
import time
from typing import Optional
from fastapi import Request
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
import structlog

logger = structlog.get_logger(__name__)


# === HTTP 指标 ===

# Counter：HTTP 请求总数（按 method/path/status 分桶）
# path 用 normalized template（避免 /api/interview/{id} 产生无限 label）
REQUEST_TOTAL = Counter(
    "request_total",
    "Total HTTP requests",
    labelnames=("method", "path", "status"),
)

# Histogram：HTTP 请求耗时
REQUEST_DURATION = Histogram(
    "request_duration_seconds",
    "HTTP request duration in seconds",
    labelnames=("method", "path"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)


# === LLM 指标 ===

LLM_CALLS_TOTAL = Counter(
    "llm_calls_total",
    "Total LLM API calls",
    labelnames=("provider", "model", "status"),  # status=success|error|timeout
)

LLM_CALL_DURATION = Histogram(
    "llm_call_duration_seconds",
    "LLM API call duration in seconds",
    labelnames=("provider", "model"),
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0),
)

LLM_TOKENS_TOTAL = Counter(
    "llm_tokens_total",
    "Total LLM tokens consumed",
    labelnames=("provider", "model", "type"),  # type=prompt|completion
)

# 成本（美元，按 provider/model 分桶）
# 商用场景：可以基于 token 总数 × 单价 计算累计成本
LLM_COST_USD_TOTAL = Counter(
    "llm_cost_usd_total",
    "Total LLM cost in USD",
    labelnames=("provider", "model"),
)


# === 存储指标 ===

MEMORY_OPS_TOTAL = Counter(
    "memory_ops_total",
    "Total memory store operations",
    labelnames=("store", "op", "status"),  # store=redis|milvus|qdrant|mem0, op=get|set|search|insert|delete, status=success|error
)

MEMORY_OP_DURATION = Histogram(
    "memory_op_duration_seconds",
    "Memory store operation duration in seconds",
    labelnames=("store", "op"),
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0),
)


# === Path 归一化 ===

# 把动态 path 归一化成 template，避免 cardinality 爆炸
# 例：/api/interview/abc-123 → /api/interview/{id}
_PATH_TEMPLATES = {
    "/api/interview/": "/api/interview/{id}",
}


def normalize_path(path: str) -> str:
    """把动态 path 归一化成 template

    prometheus 最佳实践：metric label 的 cardinality 不能太高
    例：/api/interview/abc-123 和 /api/interview/xyz-789 应该归一化成 /api/interview/{id}
    """
    for prefix, template in _PATH_TEMPLATES.items():
        if path.startswith(prefix):
            return template
    return path


# === Middleware ===

async def prometheus_middleware(request: Request, call_next):
    """Prometheus HTTP 指标收集中间件

    记录：
    - request_total（method/path/status）
    - request_duration_seconds（histogram）
    """
    method = request.method
    path = normalize_path(request.url.path)
    start = time.perf_counter()

    try:
        response = await call_next(request)
        status = str(response.status_code)
        return response
    except Exception as exc:
        # 异常走 AppError handler 路径，这里记 error
        status = "500"
        logger.warning(
            "metrics_request_exception",
            method=method,
            path=path,
            error=str(exc),
        )
        raise
    finally:
        duration = time.perf_counter() - start
        REQUEST_DURATION.labels(method=method, path=path).observe(duration)
        REQUEST_TOTAL.labels(method=method, path=path, status=status).inc()


# === Metrics 端点 ===

def metrics_endpoint() -> Response:
    """暴露 /api/metrics 端点

    返回格式：text/plain; version=0.0.4; charset=utf-8（prometheus 约定）
    """
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


# === 工具函数（被业务代码调用） ===

def record_llm_call(
    provider: str,
    model: str,
    status: str,
    duration_seconds: float,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    cost_usd: Optional[float] = None,
) -> None:
    """记录 LLM 调用指标（被 qwen_provider 等业务代码调用）

    用法：
    ```python
    start = time.perf_counter()
    try:
        result = await client.chat(...)
        record_llm_call("qwen", "qwen-max", "success", time.perf_counter() - start,
                       prompt_tokens=result.usage.prompt, completion_tokens=result.usage.completion,
                       cost_usd=result.cost_usd)
    except TimeoutError:
        record_llm_call("qwen", "qwen-max", "timeout", time.perf_counter() - start)
    ```
    """
    LLM_CALLS_TOTAL.labels(provider=provider, model=model, status=status).inc()
    LLM_CALL_DURATION.labels(provider=provider, model=model).observe(duration_seconds)
    if prompt_tokens:
        LLM_TOKENS_TOTAL.labels(provider=provider, model=model, type="prompt").inc(prompt_tokens)
    if completion_tokens:
        LLM_TOKENS_TOTAL.labels(provider=provider, model=model, type="completion").inc(completion_tokens)
    if cost_usd:
        LLM_COST_USD_TOTAL.labels(provider=provider, model=model).inc(cost_usd)


def record_memory_op(
    store: str,
    op: str,
    status: str,
    duration_seconds: float,
) -> None:
    """记录存储操作指标（被 redis/milvus/qdrant/mem0 调用）

    用法：
    ```python
    start = time.perf_counter()
    try:
        await redis.get(key)
        record_memory_op("redis", "get", "success", time.perf_counter() - start)
    except Exception:
        record_memory_op("redis", "get", "error", time.perf_counter() - start)
    ```
    """
    MEMORY_OPS_TOTAL.labels(store=store, op=op, status=status).inc()
    MEMORY_OP_DURATION.labels(store=store, op=op).observe(duration_seconds)