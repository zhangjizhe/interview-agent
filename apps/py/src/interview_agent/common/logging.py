"""统一日志格式 — 与 NestJS Logger 输出风格对齐。"""
import logging
import sys


def setup_logging(level: str = "info") -> None:
    """初始化日志配置。

    输出格式：`2026-06-27 22:00:00 [INFO] [interview_agent.main] xxx`
    与 NestJS `Logger.log(...)` 时间格式一致。
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    # 静音 noisy libs
    for noisy in ["httpx", "httpcore", "urllib3", "asyncio", "sqlalchemy.engine"]:
        logging.getLogger(noisy).setLevel(logging.WARNING)