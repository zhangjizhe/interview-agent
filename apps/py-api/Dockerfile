FROM python:3.11-slim

WORKDIR /app

# 装系统依赖（pymilvus + psycopg2 二进制）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# 装 pip 依赖
COPY apps/py-api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple \
    -r /tmp/requirements.txt

# 拷贝源码
COPY apps/py-api /app/apps/py-api
COPY packages/shared-types /app/packages/shared-types 2>/dev/null || true
COPY config /app/apps/py-api/config

WORKDIR /app/apps/py-api

EXPOSE 3002

# 健康检查（用 python -c 跑 urllib，不依赖 curl 业务包）
HEALTHCHECK --interval=15s --timeout=10s --retries=15 --start-period=90s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3002/api/health').read()" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3002"]