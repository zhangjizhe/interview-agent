"""Throttler — 与 NestJS ThrottlerModule 全局限流 1:1 对齐。

NestJS 配置：
- ttl: 60000（毫秒） — 注意是 ms 不是 s
- limit: 60（每分钟每 IP 60 个请求）

slowapi 等价：
- default_limits=["60/minute"]
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# 全局限流：60 req/min/IP（与 NestJS ThrottlerModule.forRootAsync 配置对齐）
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{60}/minute"],
    headers_enabled=True,
)