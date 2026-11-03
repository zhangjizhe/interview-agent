# 07 · 开发与运维

> 开发宪法：`docs/PROJECT-CONSTITUTION.md` · 开发入口：`AGENTS.md`
> 排障手册：`docs/runbook.md` · 测试说明：`docs/TESTING.md`

## 1. 开工前先读（强制顺序）

`AGENTS.md` 规定的上下文加载顺序，**不要跳**：

```
1. AGENTS.md
2. docs/PROJECT-CONSTITUTION.md
3. docs/project/PROJECT_CONTEXT.md
4. docs/project/CURRENT_STATE.md
5. docs/project/ACTIVE_TASK.md
6. docs/project/CONTEXT_INDEX.md  （之后只按任务选读）
```

配套的是**代码事实原则**：源码为唯一权威；README/注释/历史验收只能当线索；未跑测试不写"通过"；未部署不写"上线"；fixture 不写"真实模型效果"。

这条不是形式主义——本项目的历史结论里混着"隔离恢复"、"合成数据"、"录制回放"等不同强度的证据，混淆就会得出错误结论。

## 2. 环境准备

```bash
cp .env.example .env
openssl rand -base64 48        # 生成 JWT_SECRET
```

必填/关键项：

| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | **必须换掉默认值**，商用模式缺失会 fail-fast |
| `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL` | 主 Provider（必需） |
| `DEEPSEEK_API_KEY` / `_BASE_URL` / `_MODEL` | 备用 Provider（可选） |
| `DATABASE_URL` / `REDIS_URL` / `QDRANT_URL` / `MILVUS_URL` | 存储连接 |
| `ADMIN_USER_IDS` | **受控管理员**，多个用逗号分隔；Lab 的 ADMIN 门禁靠它 |
| `LLM_PRICING_CATALOG_JSON` | 覆盖内置计价目录（可选） |
| `AGENT_LAB_MAX_EVALUATION_COST_CNY` | 评测预算上限（软停止边界） |
| `QUOTA_MONTHLY_INTERVIEW_LIMIT` | 月度面试额度 |
| `THROTTLER_TTL` / `_LIMIT` / `_AUTH_LIMIT` / `_SSE_LIMIT` | 限流三档 |
| `LANGFUSE_*` / `LANGCHAIN_*` | 追踪（三项采样率） |
| `MEM0_*` | 长期记忆 |
| `WORKSPACE_ALLOWED_BINARIES` | Lab 工作区允许执行的命令白名单 |
| `METRICS_TOKEN` | `/api/metrics` 访问令牌 |

> `.env` 永不提交；`.env.example` 是唯一的事实来源。

## 3. 常用命令

```bash
# 基础设施
pnpm infra:up            # docker compose up -d postgres redis qdrant
pnpm infra:down
pnpm infra:logs

# 本地开发
pnpm dev                 # 并行起 api + web（+ agent-lab）
pnpm dev:api             # 只起后端
pnpm dev:web

# 数据库
pnpm db:generate
pnpm db:migrate
pnpm db:deploy           # 生产迁移
pnpm db:studio

# 质量门
pnpm lint --max-warnings 0
pnpm typecheck
pnpm build

# 全容器
docker compose up -d --build
```

一键初始化（含依赖、基础设施、迁移）：

```bash
pnpm setup     # cp .env.example → pnpm install → infra:up → db:generate → db:migrate
```

## 4. 测试分层

| 层 | 命令 | 当前实数（2026-10-08） | 说明 |
| --- | --- | --- | --- |
| 接口联调 | `bash scripts/ci-local-test.sh` | 9 接口 | 5 秒跑完，覆盖 health/ready、list、stats、tools、mcp、knowledge-base、question-bank、upload-resume（真 PDF） |
| API 单元/集成 | `pnpm --filter api test:jest --runInBand` | 626 通过 | 含真实 Redis、multipart、依赖补丁回归 |
| 数据库专项 | `bash scripts/db/verify-phase2.sh` | 17 通过 | 新库 + 旧库升级 + 租户/额度/评测任务；需要 Docker |
| 缓存 | `pnpm --filter api test:unit` | 22 通过 | 缓存单测 |
| 前端 | `pnpm --filter web test` | 95 通过 | Web + Lab 组件 |
| 评测数据 | `pnpm --filter api eval:validate` | 30 Cases | 合成工程基准格式校验 |
| 构建镜像 smoke | `bash scripts/ci/verify-built-api.sh` | 12/12 | 独立 PG/Redis/Milvus，阻断外部 Provider |

两条环境要求：

- 真实 Redis 回归需显式设置 `ANSWER_CACHE_TEST_REDIS_URL`（建议隔离库 `/15`）
- 数据库脚本需要 Docker，会自动创建并清理专用测试实例

**别用"本地通过"当结论**——README 明确：本地通过不等于远端 CI 通过；隔离恢复不等于生产恢复。

## 5. 分支与交付纪律

```
agent-lab      ← 所有开发在这里（README 明示「开发统一在 agent-lab 分支」）
main           ← 只接收通过合并核验的提交，合并不等于发布
```

一次交付必须包含（AGENTS.md 要求）：

1. 跑相关验证（测试/lint/typecheck/build）
2. **检查 diff**（确认没有夹带、没有密钥）
3. 更新 `docs/project/CURRENT_STATE.md`、`TASKS.md`、`THREAD_HANDOFF.md`
4. 若改了架构/决策/变更 → 同步 `ARCHITECTURE_MAP.md`、`DECISIONS.md`、`CHANGELOG.md`
5. 推送 `origin/agent-lab` 并**确认远端结果**

禁止提交：API Key、密码、访问令牌、用户个人数据、本机绝对路径、未脱敏日志。

## 6. CI

| Workflow | 文件 | 覆盖 |
| --- | --- | --- |
| CI (api) | `.github/workflows/ci-api.yml` | lint-type-test + interface-e2e（9 接口）+ ci-summary |
| CI (py-api) | `.github/workflows/ci-py-api.yml` | ruff + mypy + pytest + docker build + web-test + ci-summary |

本地等价物：`scripts/ci-local-test.sh`（避免 `act` 拉 17GB 镜像）。

`scripts/ci/` 下还有一批"证据型"脚本，值得知道它们存在：

| 脚本 | 证明什么 |
| --- | --- |
| `golden-model-contract.mjs` | 模型输出契约 |
| `fixture-model-server.mjs` / `fixture-model-stream.test.mjs` | 用假模型服务器测流式契约（不烧钱） |
| `pg-dump-compare.mjs` | 备份/恢复一致性 |
| `security-audit.mjs` / `security-audit-policy.mjs` | 依赖审计与策略 |
| `nginx-api-error.test.mjs` | 网关错误透传 |
| `hono-node-server.security.test.mjs` | 服务端安全头 |

`fixture-model-server.mjs` 是接新 Provider 时的第一道验证工具：**先让假服务器通过契约测试，再花真钱**。

## 7. 排障（`docs/runbook.md` 四场景）

| 现象 | 首查 | 常见原因 |
| --- | --- | --- |
| 启动即失败，报 `JWT_SECRET` | `.env` | 没换默认值 / compose 变量未注入 |
| `/api/health/ready` 返回 503 | `docker compose ps` | Milvus/Qdrant/Redis 没起，或迁移未执行 |
| 502/503，`ExternalServiceError` | `getProviderStatus()` | Provider 401/402/403/404 被永久禁用；或限流 |
| 429 | 限流配置 | `THROTTLER_*` 触发；SSE 有独立档位 |

额外两条实战经验（来自代码注释）：

- **Provider 被禁用后不会自愈**：换 key 后要 `setProviderEnabled(name, true)`
- **首字延迟突然变大**：先看是不是某个 provider 被禁用但没生效（会先打一次必失败请求）

## 8. 提交前 Checklist

- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `bash scripts/ci-local-test.sh`
- [ ] 相关单测（`api` / `web`）
- [ ] `git diff` 自查：无密钥、无本机路径、无调试残留
- [ ] 更新 `CURRENT_STATE.md` / `TASKS.md` / `THREAD_HANDOFF.md`
- [ ] 结论用词与证据强度匹配（不把 fixture 说成真实效果）

---

[← 返回索引](./Home.md)　|　上一篇：[06 Agent Lab](./06-agent-lab.md)　|　下一篇：[08 · GPT 接入方案](./08-gpt-integration.md)
