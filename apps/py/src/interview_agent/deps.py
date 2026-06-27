"""FastAPI 依赖注入 — 与 NestJS Provider / Module 体系对齐。

Phase 1 仅暴露 Settings 依赖；后续 Phase 引入：
- DB session
- Redis client
- LLM providers
- Memory stores
- Multi-Agent service
"""
from typing import Annotated

from fastapi import Depends

from interview_agent.config import Settings, get_settings

SettingsDep = Annotated[Settings, Depends(get_settings)]