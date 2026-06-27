# ============================================
# Interview Agent — Python 后端
# ============================================
# 与 NestJS 版本（apps/api/）像素级等价：
# - API contract 完全一致
# - DB schema / Redis key 命名完全一致
# - SSE 流式协议完全一致
# 前端无需改一行代码，切换分支即可切换后端部署。
# ============================================

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/src

WORKDIR /app

# 系统依赖（编译 asyncpg / psycopg2 / sentence-transformers 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# 先装依赖（利用 Docker layer cache）
COPY apps/py/pyproject.toml apps/py/README.md ./
# 创建空 src/ 让 setuptools egg_info 跑通
RUN mkdir -p src/interview_agent && touch src/interview_agent/__init__.py
RUN pip install --upgrade pip && pip install .

# 拷贝源码（覆盖 setuptools 安装的 stub）
COPY apps/py/src ./src
COPY apps/py/alembic ./alembic
COPY apps/py/alembic.ini ./

EXPOSE 3001

# Healthcheck — 跟 NestJS 镜像行为一致：调 /health 返回 200 算健康
HEALTHCHECK --interval=15s --timeout=10s --retries=15 --start-period=90s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3001/health').read()" || exit 1

CMD ["uvicorn", "interview_agent.main:app", "--host", "0.0.0.0", "--port", "3001", "--workers", "1"]