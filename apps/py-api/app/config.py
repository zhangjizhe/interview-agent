"""
Pydantic 配置（对齐 NestJS configuration.ts）
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Server
    PORT: int = 3002
    CORS_ORIGIN: str = "http://localhost:5173"

    # LLM Providers
    QWEN_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # Memory L1/L2: Redis
    REDIS_URL: str = "redis://redis:6379"

    # Memory L3: Milvus + Mem0
    MILVUS_URL: str = "http://milvus:19530"
    MEM0_API_KEY: str = ""
    MEM0_HOST: str = ""

    # Memory L4: PostgreSQL（Prisma 替代品 = SQLAlchemy）
    DATABASE_URL: str = "postgresql://dev:dev123@postgres:5432/interview"

    # Auth
    JWT_SECRET: str = "dev-secret-change-in-prod"
    JWT_EXPIRES_IN: str = "7d"

    # Observability
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    # MCP
    MCP_CONFIG_PATH: str = "/app/apps/py-api/config/mcp-servers.json"


settings = Settings()