"""Metrics 路由 · /api/metrics 给 prometheus 抓取

商用：
- 不走 Rate Limiting（让 prometheus 高频抓）
- 返回 text/plain prometheus format
- 用 prometheus_client 默认 registry（含 app 自定义 metric）
"""
from fastapi import APIRouter, Response
from app.core.metrics import metrics_endpoint

router = APIRouter()


@router.get("/metrics", include_in_schema=False)
async def get_metrics() -> Response:
    """暴露 prometheus 指标端点

    抓取配置示例（prometheus.yml）：
    ```yaml
    scrape_configs:
      - job_name: 'interview-agent'
        scrape_interval: 15s
        static_configs:
          - targets: ['py-api:3002']
        metrics_path: '/api/metrics'
    ```
    """
    return metrics_endpoint()