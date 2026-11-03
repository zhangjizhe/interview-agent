# 01 · 架构总览

## 1. 一句话

**pnpm workspace 的模块化单体**：一个 NestJS 后端（`apps/api`）承载 Interview 与 Agent Lab 两个前端，Postgres/Redis/Qdrant/Milvus 四类存储分工明确，模型调用统一收敛到一个 LLM 网关。

不做微服务是刻意选择——评测与面试共享同一套 Agent Runtime、额度账本和租户上下文，拆开会让「证据可追溯」变复杂。

## 2. 仓库布局

```
interview-agent/
├── apps/
│   ├── api/            NestJS 主后端（默认产品路径）· 302 个 ts · 38,775 行 · 137 条路由
│   ├── web/            Interview 前端 · React + Vite · 60 个 ts/tsx
│   ├── agent-lab/      Agent Lab 前端 · React + Vite · 9 个 ts/tsx
│   └── py-api/         实验性 Python 替代实现（非默认路径，勿当产品改）
├── packages/
│   └── shared-types/   前后端共享类型
├── docker/             Dockerfile 等
├── infra/              Prometheus / Grafana 配置
├── patches/            依赖补丁（如 braces 深度限制）
├── scripts/            联调 / CI / 数据库验证脚本
├── docs/               见 Home 的「文档关系」
├── docker-compose.yml  12 个服务
├── Makefile / deploy.sh
└── AGENTS.md           开发约定（改代码前必读）
```

## 3. 运行时拓扑（`docker-compose.yml`）

| 服务 | 作用 | 端口 |
| --- | --- | --- |
| `postgres` | 业务库（Prisma） | 5432 |
| `redis` | 会话、额度账本、精确答案缓存 | 6379 |
| `qdrant` | 向量检索（主） | 6333 |
| `milvus-etcd` / `milvus` | 向量检索（历史/兼容，Milvus 依赖 etcd） | 19530 |
| `migration` | **一次性迁移任务**，成功后 api 才启动 | — |
| `api` | NestJS | 3001 |
| `py-api` | 实验实现（compose profile 选配） | 3002 |
| `web` | Interview 前端 | 5173 |
| `agent-lab` | Agent Lab 前端 | 5175 |
| `prometheus` / `grafana` | 指标与看板 | 9090 / 3000 |

三个值得注意的部署细节（都体现在 compose 里）：

1. **迁移独立成服务**：`migration` 完成后 `api` 才启动，避免应用启动时改表。
2. **readiness 不是健康证明**：`/api/health/ready` 只校验 Postgres / Redis / 所需迁移；它**不能**替代全链路可用性验证（模型额度、Provider 可达性都在它之外）。
3. **双层 fail-fast**：compose 层用 `${VAR:?msg}` 在起容器前失败；应用层用 `ConfigService` 校验（如商用模式下 `JWT_SECRET` 必填）。

## 4. 请求链路

```
浏览器 (web / agent-lab)
   │  JWT（AuthGuard）+ 租户上下文（requireTenant）
   ▼
NestJS Controller  ── DTO 校验 ──► Service / Runtime
   │                                   │
   │                                   ├─► Prisma  → Postgres
   │                                   ├─► Redis   → 会话 / 额度 / 缓存
   │                                   ├─► Qdrant/Milvus → 检索
   │                                   └─► LlmGatewayService ──► Provider(Qwen/DeepSeek)
   │
   └─ SSE（面试流式回答）/ 普通 JSON
```

除 `health`、`auth/login` 等少数公开路由外，业务请求都必须经过：

- **AuthGuard**：JWT 校验
- **租户隔离**：`requireTenant()` 取 `organizationId` + `userId`；**不接受调用方自报身份**（缓存与账本都以它为准，见 `llm.gateway.service.ts:407`）
- **限流**：`THROTTLER_*` 三档（普通 / 认证 / SSE）

## 5. 模块清单（按规模）

`apps/api/src/modules/` 下（文件数不含 `*.spec.ts`）：

| 模块 | 文件 | 职责 | 关键点 |
| --- | --- | --- | --- |
| `interview` | 46 | 面试主流程、题库、简历、HITL、技能画像、MCP 管理 | 7 个控制器，路由都挂 `interview` / `hitl` / `tools` / `admin/mcp-servers` |
| `agent-lab` | 36 | 版本、运行、评测任务、发布门、受控进化 | 5 个控制器；含预算、租约、证据合同 |
| `agent` | 11 | 多智能体编排入口 | 调用 `agents/multi-agent` 图 |
| `llm` | 15（2,629 行） | LLM 网关 | Provider 路由 / 缓存 / 额度 / 计价 |
| `inference` | 9（1,516 行） | 判定与统计推断 | 发布门、题库路由、决策账本 |
| `auth` / `organizations` / `user` | 9 / 6 / 2 | 认证与租户 | RBAC、`ADMIN_USER_IDS` 白名单 |
| `memory` | 6 | 记忆分层 | Mem0 + Postgres + 向量库 |
| `mcp` | 4 | MCP 服务端管理 | 进程外持久化、授权审计 |
| `knowledge-base` | 3 | 知识库 | 文档入库与检索 |
| `metrics` / `reflection` | 3 / 2 | 指标、反思 | Prometheus 暴露 / 会话复盘 |

辅助目录：

| 目录 | 内容 |
| --- | --- |
| `src/agents/multi-agent/` | LangGraph 图（7 节点）、state、citation、`llm-gateway-chat-model.ts` 适配器 |
| `src/infra/` | `config`（`AppConfig` 类型化配置）、`prisma`、`redis`、`qdrant`、`langfuse` |
| `src/evals/` | 评测数据集与运行器 |
| `src/common/` | 健康检查、异常、拦截器 |
| `src/__tests__/` | 跨模块集成测试 |

## 6. 三条贯穿全局的约束

理解这三条，才能理解为什么代码里有那么多"看起来多余"的检查。

### 6.1 证据优先于结论

任何"通过/发布/降价"的结论都必须带证据对象（`*Evidence`、`AcceptanceReport`、`ReleaseDecision`）。费率变了要新增 `catalogVersion`；费用未知时状态是 `COST_UNKNOWN`，**不允许记 0**。

体现在代码：`llm-pricing-catalog.service.ts` 的 `available | unavailable` 联合类型、`quota.settleAuxiliary` 的 `COST_UNKNOWN` 分支。

### 6.2 版本即边界

Agent 的行为由**版本**（`LabAgentVersion` / `AgentVersion`）固化，模型身份也记在版本上（`modelProvider` / `modelVersion`）。这意味着：**改模型 = 出新版本**，而不是改环境变量了事。这条直接决定 GPT 接入的方案形态（见 [08](./08-gpt-integration.md)）。

### 6.3 隔离不等于生产证明

`README` 反复强调"隔离恢复不等于生产恢复"、"本地通过不等于远端 CI 通过"。写文档和验收报告时要沿用这个口径，不能把本地结果说成生产结论。

## 7. 与其他文档的分工

- 业务细节 → [02](./02-interview-domain.md)
- Agent 内部 → [03](./03-agent-runtime.md)
- 模型层 → [04](./04-llm-gateway.md)
- 表结构 → [05](./05-data-and-storage.md)
- 评测治理 → [06](./06-agent-lab.md)
- 怎么跑、怎么测 → [07](./07-dev-and-ops.md)

---

[← 返回索引](./Home.md)　|　下一篇：[02 · Interview 业务](./02-interview-domain.md)
