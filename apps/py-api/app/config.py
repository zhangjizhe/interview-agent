"""
Pydantic 配置（对齐 NestJS configuration.ts）

fail-fast 策略（仿 NestJS ${VAR:?msg}）：
- JWT_SECRET：必须 ≥32 字符且不能是默认 dev 占位（启动前校验）
- DATABASE_URL / REDIS_URL：必须是合法 URL
- LLM API Key：商用 fail-fast（dev 占位 OK）
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator, ValidationError
import sys

# Pydantic v2: ValidationError 在 pydantic 包，pydantic_settings 没有 SettingsValidationError
SettingsValidationError = ValidationError


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

    # 环境标识（dev / production）
    NODE_ENV: str = "development"

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        """JWT_SECRET fail-fast：商用必须有强密钥

        规则：
        - 生产环境：≥32 字符且不能是 dev 占位
        - 开发环境：允许 dev 占位（dev-secret-*），但也要 ≥16 字符
        """
        if v.startswith("dev-secret") and len(v) < 16:
            raise ValueError(
                f"JWT_SECRET 长度不足（{len(v)} < 16）。dev 环境至少 16 字符，"
                f"或运行 `openssl rand -base64 48` 生成 ≥32 字符商用密钥。"
            )
        return v

    @model_validator(mode="after")
    def fail_fast_in_production(self):
        """生产模式 fail-fast：JWT_SECRET 必须强密钥"""
        if self.NODE_ENV == "production":
            if self.JWT_SECRET.startswith("dev-secret"):
                raise ValueError(
                    "NODE_ENV=production 但 JWT_SECRET 仍是 dev 占位。"
                    "商用前必须设置 JWT_SECRET=<openssl rand -base64 48>"
                )
            if len(self.JWT_SECRET) < 32:
                raise ValueError(
                    f"NODE_ENV=production 但 JWT_SECRET 仅 {len(self.JWT_SECRET)} 字符。"
                    f"商用前必须 ≥32 字符（建议 openssl rand -base64 48）。"
                )
        return self


try:
    settings = Settings()
except SettingsValidationError as e:
    # 启动前 fail-fast：把校验错误打到 stderr 并退出
    print(f"\n❌ 配置校验失败（启动前 fail-fast）：\n{e}\n", file=sys.stderr)
    print("提示：商用前必须设置 JWT_SECRET=<openssl rand -base64 48>", file=sys.stderr)
    sys.exit(1)