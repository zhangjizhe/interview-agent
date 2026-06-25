# Runbook · 故障排查 SOP

> 2026-06-25 · 商用部署故障排查手册（基于真实代码 + 真实错误日志）
> 4 个高频故障场景 + 排查步骤 + 修复命令

---

## 目录

- [故障 1：JWT_SECRET 报错（启动失败）](#故障-1jwt_secret-报错启动失败)
- [故障 2：Milvus 连接失败（readiness 503）](#故障-2milvus-连接失败readiness-503)
- [故障 3：LLM 5xx（502/503 ExternalServiceError）](#故障-3llm-5xx502503-externalserviceerror)
- [故障 4：Rate Limit 触发（429）](#故障-4rate-limit-触发429)

---

## 故障 1：JWT_SECRET 报错（启动失败）

### 症状

**A. docker compose 启动时报错**（fail-fast，容器不启动）：

```
error while interpolating services.py-api.environment.JWT_SECRET:
required variable JWT_SECRET is missing a value: JWT_SECRET must be set in .env (deploy.sh 自动生成 dev 占位)
```

**B. 容器起来后 py-api 进程退出**（应用层 fail-fast）：

```
pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings
JWT_SECRET
  Value error, NODE_ENV=production 但 JWT_SECRET 仍是 dev 占位。商用前必须设置 JWT_SECRET=<openssl rand -base64 48>
```

**C. JWT_SECRET 长度不足**：

```
Value error, NODE_ENV=production 但 JWT_SECRET 仅 16 字符。商用前必须 ≥32 字符（建议 openssl rand -base64 48）。
```

### 根本原因

`.env` 没设或设错 `JWT_SECRET`。两层 fail-fast 防御：

1. **docker-compose.yml L125**：`JWT_SECRET: ${JWT_SECRET:?msg}` —— docker compose 启动前校验
2. **apps/py-api/app/config.py L72-83**：`@model_validator(mode="after")` —— 容器内应用层校验

### 排查步骤

```bash
# 1. 看 .env 是否有 JWT_SECRET
grep JWT_SECRET .env

# 2. 看 py-api 启动日志（哪个 fail-fast 触发）
docker logs interview-py-api 2>&1 | grep -i "JWT_SECRET\|validation" | tail -10

# 3. 看 docker compose 报错（如果是 compose 阶段 fail-fast）
docker compose up -d py-api 2>&1 | grep -i "JWT_SECRET"
```

### 修复

**方案 A：用 deploy.sh 自动生成**（推荐，dev 环境）

```bash
bash deploy.sh
# deploy.sh L42: 自动 openssl rand -base64 48 写入 .env
```

**方案 B：手动生成商用强密钥**

```bash
# 生成 48 字节 base64 字符串（约 64 字符）
openssl rand -base64 48

# 写入 .env
echo 'JWT_SECRET=<输出粘贴这里>' >> .env

# 重启容器（必须 --force-recreate 让容器重读 .env）
docker compose up -d --force-recreate --no-deps py-api
```

**方案 C：dev 环境用 .env.example 占位**（≥32 字符但仍是 dev）

```bash
# .env.example 已给 dev 占位（≥32 字符），可直接复制
cp .env.example .env
```

### 验证

```bash
# 1. JWT 长度 ≥32
grep -E "^JWT_SECRET=" .env | awk -F= '{print "length:", length($2)}'

# 2. 容器能起
docker compose ps py-api  # 状态 healthy

# 3. JWT 能签发
curl -X POST http://localhost:3002/api/auth/login -H "Content-Type: application/json" -d '{}'
# {"accessToken":"eyJ...","tokenType":"Bearer","expiresIn":"7d"}
```

### 预防

- CI workflow ci-py-api.yml smoke test 必须设 `JWT_SECRET=ci_test_secret_at_least_32_characters_long_xxxxxxxx`
- 商用前 checklist：见 README L575「商用部署清单」

---

## 故障 2：Milvus 连接失败（readiness 503）

### 症状

**A. /api/health/ready 返回 503**：

```bash
curl -i http://localhost:3002/api/health/ready
```

```
HTTP/1.1 503 Service Unavailable
{
  "detail": {
    "status": "not_ready",
    "checks": {
      "redis": "ok",
      "milvus": "not_connected"
    }
  }
}
```

**B. K8s readinessProbe 失败 → 流量切走**（K8s 自动行为）

**C. py-api 结构化日志**：

```
[warning] milvus_connect_failed host=milvus port=19530 error=<具体错误>
[warning] readiness_check_failed checks={'redis': 'ok', 'milvus': 'not_connected'}
```

### 根本原因

Milvus 容器没起 / 网络不通 / host 配置错。Milvus 启动慢（~30-60s 含 etcd + MinIO 依赖），常见原因：

1. **Milvus 容器还没 ready**：milvus-etcd / MinIO 启动慢，Milvus 还在等待依赖
2. **MILVUS_HOST 配置错**：容器内 vs 容器外（localhost vs milvus）
3. **Milvus 健康检查未过**：pod 重启循环
4. **网络端口冲突**：19530 被其他进程占用

### 排查步骤

```bash
# 1. 看 Milvus 容器状态
docker compose ps milvus
# 期望：Up X minutes (healthy)
# 实际：Restarting / Exit / unhealthy

# 2. 看 Milvus 日志
docker logs interview-milvus --tail 50 | grep -i "error\|fail\|panic"

# 3. 看 Milvus etcd 日志（依赖）
docker logs interview-milvus-etcd --tail 20

# 4. 测试 Milvus 端口（容器内 → 19530）
docker exec interview-py-api bash -c "nc -zv milvus 19530"

# 5. 看 py-api 启动日志
docker logs interview-py-api 2>&1 | grep -i "milvus" | tail -10
```

### 修复

**方案 A：等 Milvus 完全启动**（最常见）

```bash
# Milvus 通常 30-60s 起来
docker compose ps milvus  # 等到 healthy

# 强制重试 readiness
curl http://localhost:3002/api/health/ready
```

**方案 B：host 配置错**

```bash
# 检查 .env
grep MILVUS .env

# 容器内必须用 service name（不是 localhost）
# 正确：MILVUS_HOST=milvus
# 错误：MILVUS_HOST=localhost  # 容器内 localhost = 容器自己

# 修复后重启
docker compose up -d --force-recreate --no-deps py-api
```

**方案 C：端口冲突**

```bash
# 看 19530 谁占用
lsof -i :19530

# 杀掉冲突进程
kill -9 <PID>
docker compose restart milvus
```

**方案 D：彻底重建 Milvus**

```bash
# 警告：会清空 Milvus 数据（重新 KB 导入）
docker compose down milvus milvus-etcd minio
docker volume rm interview-agent_milvus-data interview-agent_minio-data
docker compose up -d milvus
# 等 60s 看 healthy

# 触发 KB 导入（如果有 init script）
docker exec interview-py-api bash -c "cd /app/apps/py-api && python -m app.scripts.import_kb"
```

### 验证

```bash
curl http://localhost:3002/api/health/ready | python3 -m json.tool
# 期望：{"status":"ready","checks":{"redis":"ok","milvus":"ok"}}
```

### 预防

- `docker-compose.yml` 设 `healthcheck: test: ["CMD", "curl", "-f", "http://localhost:9091/health"]` 让 K8s 知道何时 ready
- py-api 启动时 await milvus_mem.connect()，不让 healthcheck 抢跑
- K8s readinessProbe 间隔 10s + 失败 3 次再切流量（避免误杀）

---

## 故障 3：LLM 5xx（502/503 ExternalServiceError）

### 症状

**A. API 返回 502**（非可重试错误，4xx 鉴权失败 / 4xx 配额耗尽）：

```bash
curl -i -X POST http://localhost:3002/api/interview/start -H "Authorization: Bearer xxx" -d '{...}'
```

```
HTTP/1.1 502 Bad Gateway
{
  "error": "EXTERNAL_SERVICE_ERROR",
  "message": "Qwen API error: <OpenAI 错误>",
  "details": {"service": "qwen"},
  "request_id": "..."
}
```

**B. API 返回 503**（重试耗尽，5xx 服务端错误 / timeout）：

```
HTTP/1.1 503 Service Unavailable
{
  "error": "EXTERNAL_SERVICE_ERROR",
  "message": "Qwen API failed after 3 retries: <错误>",
  "details": {"service": "qwen"},
  "request_id": "..."
}
```

**C. py-api 结构化日志**：

```
[error] qwen_chat_non_retryable error=<错误> error_type=APIError
[error] qwen_chat_exhausted_retries attempts=3 error=<错误>
```

**D. /api/metrics 看到错误计数**：

```bash
curl http://localhost:3002/api/metrics | grep llm_calls_total
# llm_calls_total{provider="qwen",model="qwen-max",status="error"} 5.0
# llm_calls_total{provider="qwen",model="qwen-max",status="timeout"} 2.0
```

### 根本原因

| 错误类型 | status_code | 是否重试 | 触发场景 |
|---------|-------------|---------|---------|
| `APIError` 4xx（如 401/403） | 502 | ❌ 不重试 | API key 错 / 鉴权失败 / 配额耗尽 |
| `RateLimitError` 429 | 503 | ✅ 重试 | Qwen dashscope 限流 |
| `APITimeoutError` / `asyncio.TimeoutError` | 503 | ✅ 重试 | 网络慢 / 服务端慢 |
| `APIError` 5xx（如 500/502/503/504） | 503 | ✅ 重试 | 服务端故障 |
| `ConnectionError` | 503 | ✅ 重试 | 网络断开 |

重试策略：tenacity 指数退避 1/2/4s × 3 + asyncio.wait_for 30s

### 排查步骤

```bash
# 1. 看 py-api 错误日志（最近 50 条）
docker logs interview-py-api 2>&1 | grep -E "qwen_|EXTERNAL_SERVICE" | tail -20

# 2. 看错误计数（哪个 provider/model 失败多）
curl -s http://localhost:3002/api/metrics | grep llm_calls_total | grep -E "error|timeout"

# 3. 看 Qwen API 是否限流（429）
docker logs interview-py-api 2>&1 | grep "rate_limit_exceeded\|429" | tail -5

# 4. 直接 curl Qwen API（验证 key 是否有效）
curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
  -H "Authorization: Bearer $QWEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-plus","messages":[{"role":"user","content":"hi"}]}'
```

### 修复

**方案 A：API key 错 / 配额耗尽（502 不重试）**

```bash
# 检查 key
echo $QWEN_API_KEY | head -c 10  # 看前缀 sk-xxx

# 检查 dashscope 配额
open https://dashscope.console.aliyun.com/

# 换商用 key
echo 'QWEN_API_KEY=sk-xxx-new' >> .env
docker compose up -d --force-recreate --no-deps py-api
```

**方案 B：Qwen 限流（429 重试 3 次仍失败）**

```bash
# 临时降速：调小并发
# apps/py-api/app/llm/qwen_provider.py:
#   max_retries: 3 → 5（增加重试次数）
#   DEFAULT_RETRY_MAX_WAIT: 8 → 16（增加退避）

# 或切换 DeepSeek fallback（如果 DEEPSEEK_API_KEY 已配）
# apps/py-api/app/main.py: 调整 LLM Gateway 选择逻辑
```

**方案 C：Qwen 服务端故障（5xx）**

```bash
# 看 dashscope 状态页
open https://status.aliyun.com/

# 临时切 DeepSeek fallback
DEEPSEEK_API_KEY=sk-xxx  # 确保 .env 配了
# apps/py-api/app/llm/gateway.py: priority qwen=1 deepseek=2
```

**方案 D：网络问题（ConnectionError）**

```bash
# 容器内测试外网
docker exec interview-py-api bash -c "curl -I https://dashscope.aliyuncs.com"

# 看 DNS
docker exec interview-py-api bash -c "nslookup dashscope.aliyuncs.com"
```

### 验证

```bash
# 1. metrics 错误计数停止增长
curl -s http://localhost:3002/api/metrics | grep llm_calls_total | grep -E "error|timeout"

# 2. 接口正常返回
curl -X POST http://localhost:3002/api/interview/start \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"user_message":"hi","user_id":"u1"}'
# 期望 200 + {"final_response":"...","verdict":"approved"}
```

### 预防

- 监控告警：`llm_calls_total{status="error"}` 5 分钟增长率 > 10 → 告警
- 备用 key：QWEN_API_KEY 主 + 备用，环境变量轮换
- 限流策略：自维护 token bucket（避免被 dashscope 限流）
- 商用 SLA：Qwen 99.5% + DeepSeek 99% → 综合可用性 99.9%+

---

## 故障 4：Rate Limit 触发（429）

### 症状

**A. API 返回 429**：

```bash
curl -i -X POST http://localhost:3002/api/interview/start -H "X-Forwarded-For: 1.2.3.4" -d '{...}'
```

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "请求过于频繁，请稍后重试（limit: 10 per 1 minute）",
  "details": {"limit": "10 per 1 minute"},
  "request_id": "..."
}
```

**B. 前端 React 收到 429 + 显示提示**：

```ts
// apps/web/src/hooks/useInterviewStream.ts
if (response.status === 429) {
  setError(`Rate limit exceeded, retry after ${response.headers.get("Retry-After")}s`);
}
```

**C. py-api 结构化日志**：

```
[warning] rate_limit_exceeded client_ip=1.2.3.4 path=/api/interview/start method=POST limit=10 per 1 minute
```

**D. 客户端 header 提示剩余配额**：

```bash
curl -i -X POST http://localhost:3002/api/interview/start ...
# X-RateLimit-Limit: 10
# X-RateLimit-Remaining: 3
# X-RateLimit-Reset: 1700000000
```

### 根本原因

slowapi 限流策略（`apps/py-api/app/core/rate_limit.py`）：

| endpoint | 限流 | 触发场景 |
|----------|------|---------|
| `/api/auth/login` | 5/minute | 防爆破（高频猜密码） |
| `/api/interview/start` | 10/minute | 防并发滥用 |
| `/api/interview/stream` | 5/minute | SSE 长连接防占用 |
| `/api/health` | 120/minute | K8s 探针高频友好 |
| 其他 GET | 60/minute（default） | 防爬 |

key_func = `get_client_ip`（X-Forwarded-For → X-Real-IP → request.client.host）

### 排查步骤

```bash
# 1. 看 py-api 限流日志（哪个 IP 触发）
docker logs interview-py-api 2>&1 | grep rate_limit_exceeded | tail -20

# 2. 看 IP 维度计数
docker logs interview-py-api 2>&1 | grep rate_limit_exceeded | awk '{print $4}' | sort | uniq -c | sort -rn

# 3. 看 endpoint 维度
docker logs interview-py-api 2>&1 | grep rate_limit_exceeded | awk '{print $6}' | sort | uniq -c

# 4. 直接用 X-Forwarded-For 模拟其他 IP
curl -X POST http://localhost:3002/api/auth/login \
  -H "X-Forwarded-For: 1.2.3.4" \
  -H "Content-Type: application/json" -d '{}'
```

### 修复

**方案 A：等待 Retry-After 时间**（用户侧）

```bash
# 看 Retry-After header
curl -i ... | grep Retry-After
# Retry-After: 60

# 等 60s 重试
sleep 60
curl ...
```

**方案 B：调高限流阈值**（运维侧）

```python
# apps/py-api/app/core/rate_limit.py
INTERVIEW_START_LIMIT = "10/minute"  # →  "30/minute" 调高
```

```bash
docker compose up -d --force-recreate --no-deps py-api
```

**方案 C：换 IP**（绕过限流，仅用于排查）

```bash
# 代理 / VPN / 换 WiFi
# 或临时伪造 X-Forwarded-For（仅 dev 用）
curl -H "X-Forwarded-For: 9.9.9.9" ...
```

**方案 D：商用反代层限流**（架构侧）

```nginx
# nginx 反代层限流（第一道防线）
limit_req_zone $binary_remote_addr zone=interview:10m rate=10r/m;

server {
  location /api/interview/ {
    limit_req zone=interview burst=20 nodelay;
    proxy_pass http://py-api:3002;
  }
}
```

**方案 E：Redis 共享限流**（多实例部署）

```python
# apps/py-api/app/core/rate_limit.py
limiter = Limiter(
    key_func=get_client_ip,
    storage_uri="redis://redis:6379/1",  # 多实例共享
    ...
)
```

### 验证

```bash
# 1. 第 11 次请求触发 429（10/minute）
for i in {1..11}; do
  curl -s -o /dev/null -w "request $i: HTTP %{http_code}\n" \
    -X POST http://localhost:3002/api/interview/start \
    -H "X-Forwarded-For: 5.6.7.8" -d '{"user_message":"hi"}'
done
# 期望：1-10 = 200/401，11 = 429
```

### 预防

- 前端：429 自动指数退避重试（`apps/web/src/hooks/useInterviewStream.ts`）
- 监控：rate_limit_exceeded 日志频率告警（> 100/min 提示异常流量）
- 商用分层：反代层（粗）+ 应用层（细）+ 前端（友好提示）
- 多实例：必用 Redis 共享限流计数（否则每实例单独限 = 实际 N 倍配额）

---

## 附录：日志查看速查

```bash
# 实时跟踪 py-api 日志（按 service 过滤）
docker logs interview-py-api --tail 100 -f | grep -E "error|warn|failed"

# 按 request_id 追踪全链路
docker logs interview-py-api 2>&1 | grep "<request_id>"

# 结构化日志字段（structlog JSON 格式）
# request_id / service / level / event / timestamp / 业务字段

# metrics 自定义查询
curl -s http://localhost:3002/api/metrics | grep -E "request_total|llm_calls_total|memory_ops"
```

## 附录：常用调试命令

```bash
# 进入 py-api 容器
docker exec -it interview-py-api bash

# 看 .env 是否生效（容器内）
docker exec interview-py-api env | grep -E "JWT_SECRET|QWEN|MILVUS|REDIS"

# 重启单个服务
docker compose restart py-api

# 强制重建镜像（代码改了）
docker compose up -d --build --force-recreate --no-dedeps py-api

# 看 docker compose 完整日志
docker compose logs --tail 100 -f

# 清空所有数据（警告：删 KB / 记忆）
docker compose down -v
```