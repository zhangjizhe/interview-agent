# Interview Agent · AgentLab

面向技术招聘的 AI 面试平台，用可追溯的 Agent 流程连接简历、追问与评估报告。

[![API CI](https://github.com/zhangjizhe/interview-agent/actions/workflows/ci-api.yml/badge.svg)](https://github.com/zhangjizhe/interview-agent/actions/workflows/ci-api.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Node >=20](https://img.shields.io/badge/node-%3E%3D20-green)
![pnpm >=9](https://img.shields.io/badge/pnpm-%3E%3D9-orange)

- **解析简历**：从 PDF、Markdown、TXT 提取候选人信息与检索上下文。
- **生成题目**：结合岗位、简历与题库生成面试问题。
- **流式追问**：通过 SSE 展示多节点编排结果，支持人工审批。
- **输出报告**：基于持久化回答与评分信号生成评估报告。

| 工程支点 | 实现与入口 |
| --- | --- |
| 编排 | LangGraph 多节点、checkpoint 与任务队列：`apps/api/src/agents/multi-agent/`、`apps/api/src/modules/interview/services/` |
| 检索 | Milvus + BM25、RRF 与 rerank，导入后 flush：`apps/api/src/modules/knowledge-base/` |
| 网关 | Qwen / DeepSeek 路由、健康检查、永久错误熔断与成本统计：`apps/api/src/modules/llm/` |
| 平台 | AgentVersion → Application → Run → TraceEvent → Evaluation：`apps/api/src/modules/agent-lab/` |

**首次运行**：准备 Docker，复制 `.env.example` 为 `.env`，配置 `QWEN_API_KEY` 和随机 `JWT_SECRET`，运行 `docker compose up -d --build`，打开 http://localhost:5173。首次拉取镜像和构建需要数分钟；完整步骤见[快速开始](#快速开始)。

> 当前本地开发分支为 `agent-lab`。截至本次核对，本地 `main` 尚未包含平台模块；查看 GitHub 默认分支时请确认分支，不要把开发分支能力视为已发布版本。

[架构](#系统架构) · [测试与验收](#测试与验收链路) · [Roadmap](docs/ROADMAP.md) · [产品目标](docs/PRODUCT_CONSTITUTION.md) · [架构决策](docs/architecture-decisions.md)

## 核心能力

- **简历工作流**：支持 `PDF`、`Markdown`、`TXT` 简历，提取结构化候选人信息，写入检索上下文，并生成个性化追问题。
- **面试工作流**：支持创建面试、确认简历、SSE 流式对话、动态出题、人工审批（HITL）和报告生成。
- **模型网关**：Qwen 作为主模型、DeepSeek 作为备用模型，具备健康检查、永久错误熔断、自动降级、语义缓存和会话成本统计。
- **RAG 与题库**：结合 Milvus dense retrieval、BM25 sparse retrieval、RRF 融合和 rerank；管理员可从 Markdown 文件或公开 HTTPS 技术页面导入题目。
- **Agent 编排**：基于 LangGraph 提供状态图、checkpoint、持久化任务队列、答题历史与多角色 handoff。
- **安全控制**：使用 `scrypt` 密码哈希、默认拒绝的 JWT 鉴权、`USER`/`ADMIN` RBAC 和资源归属校验。
- **交付与验证**：提供 Docker Compose、健康检查、Prisma migration、API/Web 测试、浏览器验收和真实模型内容工作流验收。

## AgentLab 平台能力

Interview Agent 是平台的第一个应用。`apps/api/src/modules/agent-lab/` 提供 Agent 版本化注册、Application / Run / Sub-run、追加式 TraceEvent、工具审批、运行预算、插件注册及确定性评测。Web `/lab` 支持查看应用、运行与追踪，创建数据集并执行评测。

平台目前提供执行与审计契约；尚未交付 OS 级沙箱、后台调度器、远程 worker、自动重试或 LLM Judge。独立 Run 的 token / 成本指标仍不可用。完整接口、数据库升级要求和运行边界见 [AgentLab 能力与迁移说明](docs/agent-lab-status.md)。

## 系统架构

![Interview Agent 当前默认路径泳道架构](docs/assets/architecture-swimlane-current-2026-08-12.png)

架构图采用泳道形式，按“候选人/管理员 -> React Web -> NestJS API -> 数据、检索与 Provider”展示责任边界。它仅描述当前默认 NestJS 产品路径，不包含已废弃或未对齐的历史实现。

### 面试请求链路

```text
候选人提交回答
  -> Bearer JWT、角色与资源归属校验
  -> 读取面试状态、简历上下文和题库检索结果
  -> LangGraph 编排追问、评分和工具调用
  -> 精确/语义缓存与 Provider 路由、降级
  -> SSE 流式事件返回浏览器
  -> 持久化 AnswerHistory、任务、报告、成本和追踪信息
```

## 核心工程优势

### 持久化、可审查的 Agent 执行

面试流程不是无状态 Prompt 拼接。LangGraph 协调 planner、executor、reviewer 和 specialist handoff；checkpoint 使长流程可检查、可恢复。持久化任务队列和 `AnswerHistory` 保存候选人的真实回答与评分信号，报告生成从这些结构化记录读取数据，而不是根据聊天顺序猜测问答角色。实现：`apps/api/src/agents/multi-agent/`、`apps/api/src/modules/interview/services/`。

### 兼顾召回与写后可见性的检索设计

题库检索组合 dense vector search、BM25 sparse search、RRF 融合和 rerank。简历按用户独立写入检索上下文。题库导入完成前会显式 flush 向量写入，因此成功响应意味着数据可立即检索，避免向量索引异步物化带来的“写入成功但搜索不到”问题。实现：`apps/api/src/modules/knowledge-base/`。

### 多模型容错与成本可见性

模型网关优先调用 Qwen，必要时切换到 DeepSeek。Provider 健康检查会区分永久性凭据/账单错误与临时错误；永久错误会被熔断，避免无效重复请求。精确缓存和语义缓存提供复用机制，会话级 token 与成本记录用于核验实际收益；当前基准未证明总 Token 节省。实现：`apps/api/src/modules/llm/`。

### 多 Agent 与缓存 Token 基准

![当前多 Agent 与缓存 Token 基准](docs/assets/multi-agent-cache-benchmark-2026-08-12.png)

这是 2026-08-12 基于当前默认 NestJS 路径完成的真实对照：同一组 10 轮技术面试输入，一组直接调用 Qwen，另一组完整经过注册登录、简历 RAG、面试确认、JWT 鉴权 SSE、LangGraph 多 Agent 和会话成本面板。

| 指标 | 对照/口径 | 多 Agent + 缓存结果 |
| --- | --- | --- |
| Token 消耗 | 直接 Qwen：`15,402` tokens | 当前多 Agent 路径：`20,024` tokens |
| Token 差异 | 相同 10 轮输入 | `+30.01%`，当前未实现总 Token 节省 |
| 模型调用 | 对照组 `10` 次 | 多 Agent 路径 `61` 次 |
| 语义缓存计数 | 当前会话成本面板 | `46` 次命中记录 |
| 累计 wall time | 直接 Qwen `48.60s` | 多 Agent SSE `110.18s` |
| SSE 首事件中位数 | 当前多 Agent SSE | `259ms` |
| 成本面板响应 | 当前运行中 API | `8.8ms` |

实测说明：当前多节点图编排的调用开销大于缓存带来的收益，因此不能将语义缓存命中次数直接解释为 Token 节省。该结果作为当前版本的回归基线，后续优化方向是减少每轮图节点调用、对重复输入提前短路、确认缓存命中后不再触发下游模型节点，并增加按节点的 Token 归因。

完整机器可读结果见 [当前多 Agent 基准 JSON](apps/web/e2e/screenshots/acceptance-2026-08-12/benchmarks/multi-agent-cache-2026-08-12T16-50-35-272Z.json)，可通过 `node apps/web/e2e/multi-agent-cache-benchmark.mjs` 复跑。该脚本使用有效 Provider 凭据，输出只包含脱敏聚合指标，不记录 API Key 或模型正文。

本轮基准还修复了会话成本统计的累计问题：同一面试的后续消息不再重置 Redis 实时计数器，并已加入对应的回归测试。

### 贯穿产品的安全边界

安全不只存在于登录接口。全局 JWT Guard、角色 Guard 和资源归属校验共同保护业务接口；前端会隐藏管理员操作并将普通用户从管理路由重定向，后端仍是最终授权边界。题库写入、知识库写入和 MCP 管理仅允许管理员执行。

### 显式失败语义的内容导入

简历上传有明确的文件格式约束。题库 URL 导入仅允许公开 HTTPS 地址，拒绝内网和 loopback 地址，保留页面标题，并能从技术文档生成面试题，而非只能提取已有问答。如果页面无法产出可用题目，接口返回明确错误，而不是返回空数据的伪成功。

## 技术栈

| 领域 | 技术 |
| --- | --- |
| 前端 | React 18、Vite、TypeScript、Zustand、TanStack Query |
| 后端 | NestJS 10、TypeScript、Prisma |
| Agent | LangGraph、DeepAgents、Model Context Protocol |
| 模型 | Qwen OpenAI 兼容 API、DeepSeek fallback |
| 数据 | PostgreSQL、Redis、Milvus、Qdrant |
| 可观测性 | Langfuse、会话级 token 与成本统计 |
| 质量保障 | Docker Compose、GitHub Actions、Jest、Vitest、Playwright |

## 快速开始

### 前置要求

- Node.js 20+（仅本地源码开发需要）
- pnpm 9+（仅本地源码开发需要；纯 Docker 路径不需要本机安装 Node / pnpm）
- Docker Desktop / Docker Compose
- Qwen API Key，用于简历解析、embedding、出题和流式面试

### 配置并启动

```bash
cp .env.example .env
```

必须配置 `QWEN_API_KEY` 和 `JWT_SECRET`（示例文件中的 JWT 值为空，Compose 会拒绝启动）。可运行 `openssl rand -base64 48` 生成随机 JWT 密钥，写入 `.env`；不要提交该文件。`DEEPSEEK_API_KEY` 可选，但配置后可启用 Provider 降级。需要初始化管理员时，请在管理员注册前通过 `ADMIN_USER_IDS` 配置受控的用户 ID 列表。

```bash
docker compose up -d --build
# 镜像内生成 Prisma Client；API 入口执行 prisma migrate deploy 后才启动。
# 已有数据库升级前先备份，并阅读 docs/agent-lab-status.md。
```

| 服务 | 地址 |
| --- | --- |
| Web 应用 | http://localhost:5173 |
| API | http://localhost:3001/api |
| Liveness | http://localhost:3001/api/health |
| Readiness | http://localhost:3001/api/health/ready |

默认产品路径为 NestJS API。`apps/py-api` 保留为实验性、按需启用的实现，不是当前推荐的产品部署路径。

### 注册与登录

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"userId":"local-user","password":"local-password-123"}'

curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId":"local-user","password":"local-password-123"}'
```

登录响应会返回 `accessToken`、`tokenType`、`expiresIn`、`userId` 和 `role`。访问受保护的接口时携带：

```text
Authorization: Bearer <accessToken>
```

## 主要业务流程

### 候选人流程

1. 注册或登录。
2. 通过 `POST /api/interview/upload-resume` 上传简历，multipart 字段名为 `file`，并传入 `position`。
3. 查看解析后的简历和个性化问题。
4. 调用 `POST /api/interview/start` 创建面试。
5. 确认简历后，通过 `POST /api/interview/:interviewId/message` 进行流式对话。
6. 结束面试并生成报告。

候选人的面试和简历数据均绑定当前登录用户，其他用户访问会被拒绝。

### 管理员流程

- 通过 `POST /api/interview/question-bank/import-file` 导入题库文件。
- 通过 `POST /api/interview/question-bank/import-url` 从公开技术文档导入题目。
- 检索和管理题库。
- 导入、管理和基准测试共享知识库。
- 查看、重新加载和启停已配置 MCP Server。

## 测试与验收链路

当前测试结果、命令和未纳入默认执行的测试统一记录在 [测试基线](docs/TESTING.md)。测试文件数、测试用例数和覆盖率是不同指标；未生成覆盖率报告时不声明覆盖率。下方 2026-08-12 数据是历史验收，不代表本次重新运行了 Docker 或真实 Provider。

| 验证层级 | 覆盖内容 |
| --- | --- |
| API 回归测试 | 注册登录、角色授予、跨用户资源隔离、简历输入校验、导入失败语义和核心服务逻辑 |
| Web 单元测试 | 组件行为、前端状态和权限相关展示 |
| Typecheck 与生产构建 | 跨模块类型契约、Prisma 类型和可部署产物 |
| API CI 接口校验 | 在已构建服务中验证健康检查、认证和关键接口行为 |
| 浏览器验收 | 对 Docker 中运行的真实前后端验证登录门禁、管理员路由和移动端渲染 |
| 真实 Provider 内容工作流 | 验证简历解析、RAG 写入、个性化出题、面试确认、文件/URL 导入、即时检索与 SSRF 拒绝 |

### 最近一次验收证据

2026-08-12 的交付验收重新构建了 Docker API 与 Web 镜像，结果如下：

| 检查项 | 结果 |
| --- | --- |
| API Jest | `214 passed` |
| Web Vitest | `59 passed` |
| API 与 Web typecheck/build | 通过 |
| Prisma schema validation | 通过 |
| 浏览器认证与 RBAC 验收 | `9/9 passed` |
| 有效 Provider 的真实内容工作流 | `10/10 passed` |

内容工作流验证了简历上传与 RAG 写入、个性化问题生成、面试创建与确认、题库文件导入、从技术文档 URL 生成题目并立即检索、用户数据隔离和 SSRF 拒绝。

可查看完整的[验收报告](docs/ACCEPTANCE-REPORT-2026-08-12.md)、[内容工作流 JSON 结果](apps/web/e2e/screenshots/acceptance-2026-08-12/content-workflow-results.json)和[浏览器验收 JSON 结果](apps/web/e2e/screenshots/acceptance-2026-08-12/real-results.json)。已提交的截图与 JSON 保留为历史验收证据；新生成截图默认忽略，后续通过 CI artifact 分享。不要自动提交含候选人数据的运行产物。

### 浏览器验收截图

| 登录门禁 | 普通用户首页 |
| --- | --- |
| ![桌面端登录门禁](apps/web/e2e/screenshots/acceptance-2026-08-12/05-real-login-desktop.png) | ![普通用户认证后首页](apps/web/e2e/screenshots/acceptance-2026-08-12/06-real-user-home.png) |

| 管理员 MCP 管理页 | 移动端登录门禁 |
| --- | --- |
| ![管理员 MCP 管理页](apps/web/e2e/screenshots/acceptance-2026-08-12/07-real-admin-mcp.png) | ![移动端登录门禁](apps/web/e2e/screenshots/acceptance-2026-08-12/08-real-login-mobile.png) |

| 简历确认与开始面试 | URL 题库导入后的检索 |
| --- | --- |
| ![真实简历确认页](apps/web/e2e/screenshots/acceptance-2026-08-12/09-resume-confirmation.png) | ![真实 URL 题库检索页](apps/web/e2e/screenshots/acceptance-2026-08-12/10-question-bank-url-search.png) |

### 本地验证命令

```bash
pnpm typecheck
pnpm build
pnpm --filter @interview-agent/api test
pnpm --filter @interview-agent/web test
```

运行浏览器和真实内容验收前，需要先启动 Docker 环境、配置管理员账号和有效模型凭据：

```bash
node apps/web/e2e/content-workflow-acceptance.mjs
node apps/web/e2e/content-real-screenshots.mjs
```

## 开发与数据库

```bash
pnpm dev
pnpm dev:api
pnpm dev:web

pnpm db:generate
pnpm db:migrate
pnpm db:deploy
pnpm db:studio
```

生产发布应由部署流水线在新 API 版本接收流量前执行 `pnpm db:deploy`。

## 项目结构

```text
apps/
  api/                 NestJS API 与 Prisma schema
    src/agents/        LangGraph 编排与 Agent 工具
    src/modules/       agent-lab、auth、interview、llm、memory、knowledge-base、mcp
    prisma/            数据库 schema 与 migration
  web/                 React 应用与浏览器验收脚本
  py-api/              实验性替代后端，默认不启用
packages/
  shared-types/        前后端共享类型
docs/
  ACCEPTANCE-REPORT-2026-08-12.md
```

## Roadmap / 后续演进

以“现状 → 原因 → 下一步”维护 [Roadmap](docs/ROADMAP.md)：P0 为隐私与凭据治理，P1 为测试债务、Provider 退避和 SSE 恢复，P2 为隔离执行与容量规划。未完成能力明确保留，不以重命名隐藏问题。

本地审查改动与待发布事项见 [审查落实记录](docs/REVIEW-FOLLOWUP.md)，尚无已发布的 v1.0.0；变更记录使用 [Unreleased](CHANGELOG.md)。

## License

MIT © 2026
