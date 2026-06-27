"""统一配置 — pydantic-settings 读 .env，与 NestJS @nestjs/config 像素级对齐。

字段命名与 .env.example 完全一致（大小写不敏感，pydantic 会自动归一）。
"""
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ====== App ======
    NODE_ENV: Literal["development", "test", "production"] = "development"
    PORT: int = 3001
    WEB_PORT: int = 5173
    CORS_ORIGIN: str = "http://localhost:5173"
    LOG_LEVEL: str = "info"

    # ====== Database ======
    DATABASE_URL: str = "postgresql://dev:dev123@localhost:5432/interview"

    # ====== Redis ======
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_SESSION_TTL: int = 3600

    # ====== Vector DBs ======
    QDRANT_URL: str = "http://localhost:6333"
    MILVUS_URL: str = "http://localhost:19530"

    # ====== LLM Providers ======
    QWEN_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    QWEN_MODEL: str = "qwen-plus"
    QWEN_MAX_TOKENS: int = 128000

    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    DEEPSEEK_MAX_TOKENS: int = 64000

    LLM_DEFAULT_MAX_TOKENS: int = 32000
    AGENT_ENGINE: Literal["multi", "deepagents", "llm-direct"] = "multi"

    # ====== JWT ======
    JWT_SECRET: str = "interview-agent-dev-secret-change-in-production"
    JWT_EXPIRES_IN: str = "7d"

    # ====== Rate Limit ======
    THROTTLER_TTL: int = 60
    THROTTLER_LIMIT: int = 60

    # ====== Langfuse ======
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_BASE_URL: str = "https://us.cloud.langfuse.com"
    LANGFUSE_SAMPLE_RATE_TRACE: float = 0.1
    LANGFUSE_SAMPLE_RATE_SPAN: float = 0.5
    LANGFUSE_SAMPLE_RATE_GENERATION: float = 1.0

    # ====== LangSmith (可选) ======
    LANGCHAIN_TRACING_V2: bool = False
    LANGCHAIN_API_KEY: str = ""
    LANGCHAIN_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGCHAIN_PROJECT: str = "interview-agent"

    # ====== Bocha ======
    BOCHA_API_KEY: str = ""
    BOCHA_BASE_URL: str = "https://api.bochaai.com/v1"

    # ====== Mem0 ======
    MEM0_API_KEY: str = ""
    MEM0_HOST: str = ""
    MEM0_ORG_ID: str = ""
    MEM0_PROJECT_ID: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()