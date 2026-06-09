# AI 面试智能体 (Interview Agent)

> 基于 DeepAgents + Mem0 + Qdrant + Langfuse 的多轮结构化 AI 面试系统

## ✨ 核心亮点

- **🧠 多模型 LLM Gateway** — Qwen + DeepSeek 双模型路由、故障自动降级、Token 计量
- **💾 分层记忆体系** — Redis 短期记忆（会话上下文）+ Mem0 长期记忆（候选人画像）
- **🤖 DeepAgents 适配** — 工具调用、状态管理、自定义工具链（博查搜索）
- **📊 Langfuse 全链路可观测** — Trace/Span/Generation 三层埋点、成本核算
- **⚡ SSE 流式对话** — 首字延迟 < 800ms，实时打字机效果
- **🏗 NestJS 模块化架构** — 清晰分层、依赖注入、易测试易扩展

## 🛠 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript + Tailwind | 豆包风格 UI |
| 后端 | NestJS 10 + TypeScript | 模块化、装饰器、DI |
| 数据库 | PostgreSQL + Prisma | 业务主库 |
| 短期记忆 | Redis 7 | 会话上下文 + 限流 |
| 长期记忆 | Mem0 (Qdrant 后端) | 候选人画像 |
| 向量库 | Qdrant | 持久化、metadata 过滤 |
| LLM | Qwen / DeepSeek | OpenAI 兼容协议 |
| 可观测 | Langfuse Cloud | Trace + 成本 + Prompt 仓 |
| 搜索 | 博查 AI | Agent 联网工具 |
| 部署 | Docker Compose | 一键起本地环境（含 API） |

## 🚀 快速开始

### 方式 A：Docker 编排（生产/演示用，推荐）

```bash
# 1. 配 env
cp .env.example .env
# 编辑 .env，填 QWEN_API_KEY / DEEPSEEK_API_KEY / LANGFUSE_KEY / BOCHA_API_KEY

# 2. 一键起 4 个服务（Postgres + Redis + Qdrant + NestJS API）
docker compose up -d --build

# 3. 看后端日志
docker logs -f interview-api
# 期望看到 4 个 ✅ + 🚀 API server running on http://localhost:3001
```

> **注意**：方式 A 会构建 API 镜像（首次约 3-5 分钟），适合生产部署。
> Dockerfile 多阶段构建（builder + runtime），最终镜像 ~200MB。
> 所有 4 个服务都用 compose 起的 `dev/dev123` 凭据，**不依赖你本机其他容器**。

### 方式 B：基础设施 Docker + 后端本地 Node（开发推荐）

```bash
# 1. 启动依赖（api 不在 docker 里）
docker compose up -d postgres redis qdrant

# 2. 配 env
cp .env.example .env

# 3. 装依赖
pnpm install

# 4. 初始化 DB（首次）
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate

# 5. 启动后端（watch 模式）
pnpm start:dev
```

### 启动前端（两种方式都需要）

```bash
cd apps/web
pnpm dev
# 浏览器打开 http://localhost:5173
```

### ⚠️ 如果本机已有其他 Postgres 容器在跑

方式 A 会新建 `interview-postgres`（端口 5432）。**先停掉冲突的容器**：

```bash
docker stop pg_vector_db
docker rm pg_vector_db
docker stop interview-postgres  # 老的（dev/dev123 凭据的）
docker rm interview-postgres
```

然后再 `docker compose up -d --build`。

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 QWEN_API_KEY / DEEPSEEK_API_KEY / LANGFUSE_KEY / BOCHA_API_KEY

# ⚠️ 方式 B 必做：把 .env 同步到 apps/api/（prisma 从这里找）
cp .env apps/api/.env
```

### 3. 初始化数据库（两种情况二选一）

**情况 A：首次启动（数据库全新）**
```bash
cd apps/api
pnpm prisma:generate      # 生成 client
pnpm prisma:migrate       # 跑迁移建表（非交互式）
```

**情况 B：数据库已经有表（之前迁移过）**
```bash
cd apps/api
pnpm prisma:generate      # 生成 client
pnpm db:deploy            # 部署已有迁移（不会问名字）
```

### 4. 启动后端

**方式 A：根目录统一管理（推荐）**
```bash
cd ../..               # 回到项目根
pnpm dev:api           # 等价于 cd apps/api && pnpm start:dev
```

**方式 B：子目录启动**
```bash
cd apps/api
pnpm start:dev
```

预期日志：
```
✅ Prisma connected to database
✅ Redis connected to redis://localhost:6379
✅ Langfuse connected to https://us.cloud.langfuse.com
✅ Mem0 client initialized
🚀 API server running on http://localhost:3001
```

### 5. 启动前端

**新开一个终端**：
```bash
cd apps/web
pnpm dev
# 浏览器打开 http://localhost:5173
```

### 6. 验证

```bash
# 后端
curl http://localhost:3001/interview/list?userId=test
# 期望: []

# 前端
open http://localhost:5173
# 期望: 看到首页（带 Wall-E 图标 + token 统计 + 面试列表）
```

## 🆘 常见启动问题

**1. `Error: P1012 Environment variable not found: DATABASE_URL`**
- 没建 `.env` 或没复制到 `apps/api/`
- 解决：`cp .env apps/api/.env`

**2. `prisma migrate dev` 卡住问名字**
- 用非交互版本：`pnpm prisma:migrate`（已加 `--name init`）
- 已迁移过用：`pnpm db:deploy`

**3. `ECONNREFUSED 3001` 前端连不上后端**
- 后端没起 / 端口冲突 / 后端崩溃
- 看后端日志：`tail -f /tmp/api.log` 或终端输出
- 验证：`curl http://localhost:3001/interview/list?userId=test`

**4. `Cannot find module '@interview-agent/shared-types'`**
- 跨包类型别名没生效
- 已配 `tsconfig.paths` + `vite.alias`，**确认 `pnpm install` 跑过**

**5. `Docker 容器端口被占`**
- 5432/6379/6333 已被其他容器占（比如 pgvector）
- 改 `.env` 的 `DATABASE_URL` / `REDIS_URL` 指向**已有的**容器
- 例：`DATABASE_URL=postgresql://user:123456@localhost:5432/interview`

## 📁 项目结构

```
interview-agent/
├── apps/
│   ├── api/                          # NestJS 后端
│   │   └── src/
│   │       ├── main.ts               # 启动入口
│   │       ├── app.module.ts         # 根模块
│   │       ├── infra/                # 基础设施层
│   │       │   ├── prisma/           # 数据库
│   │       │   ├── redis/            # 短期记忆
│   │       │   ├── langfuse/         # 可观测
│   │       │   └── config/           # 配置中心
│   │       ├── modules/
│   │       │   ├── llm/              # ⭐ LLM Gateway（核心亮点）
│   │       │   │   ├── providers/    # Qwen / DeepSeek 抽象
│   │       │   │   └── llm.gateway.service.ts
│   │       │   ├── memory/           # ⭐ 记忆层
│   │       │   │   ├── short-term/   # Redis
│   │       │   │   └── long-term/    # Mem0
│   │       │   ├── agent/            # ⭐ Agent 核心
│   │       │   │   ├── tools/        # 自定义工具
│   │       │   │   └── prompts/      # Prompt 模板
│   │       │   ├── interview/        # 面试业务 + SSE
│   │       │   └── user/             # 用户
│   │       └── common/               # 通用（filters/guards）
│   └── web/                          # React 前端
│       └── src/
│           ├── App.tsx
│           ├── pages/
│           │   ├── HomePage.tsx
│           │   └── InterviewPage.tsx # 对话页（豆包风格）
│           └── hooks/
│               └── useInterviewStream.ts  # SSE 客户端
├── packages/
│   └── shared-types/                 # 共享 TS 类型
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── README.md
```

## 🎯 四大简历亮点（面试深挖点）

### 1. LLM Gateway - 多模型路由 + 故障降级

`apps/api/src/modules/llm/llm.gateway.service.ts`

```typescript
// 路由策略：代码类问题 → DeepSeek，通用对话 → Qwen
// 主 Provider 失败自动降级到备用
// 所有调用记录到 Langfuse（含 token 成本）
```

### 2. ⭐ ContextManager - 4 级水位线上下文压缩

`apps/api/src/modules/agent/services/context-manager.service.ts`

```typescript
// 借鉴 Claude Code / Codex / MUR AI 的 4 级水位线方案
// Tier 0 (<60%): 不优化
// Tier 1 (60-80%): Snip - 截短老工具输出
// Tier 2 (80-95%): Prune - 替换为占位符
// Tier 3 (≥95%): 增量 LLM 摘要

// 关键设计：
// 1. 保护区（最近 4K token 不动）
// 2. 用户消息纯文本特权（只裁代码块）
// 3. stub 决策单调推进（不滑窗，保护 Prompt Cache）
// 4. Langfuse Span 埋点：tier/token 节省/stub 数
```

**面试深挖点**：
- "为什么 4 级水位线不是 1 级全压？" → 渐进式避免悬崖，零成本操作先上
- "stub 滑窗为什么是 cache 杀手？" → prompt prefix 字节一变，全段缓存失效
- "增量摘要为什么优于全量？" → 避免反复重写导致语义漂移

> 参考：腾讯技术工程《横向拆解六大 Agent 上下文压缩策略》

**面试可以深挖**：
- "为什么需要 Provider 抽象？" → 解耦业务与具体 LLM
- "降级策略怎么设计的？" → 静态 fallback map，运行时切换
- "怎么避免降级雪崩？" → 熔断器（可扩展点，TODO）

### 2. 记忆层 - 短期/长期分离

`apps/api/src/modules/memory/memory.service.ts`

```typescript
// 短期：Redis List 存最近 50 条消息，TTL 1 小时
// 长期：Mem0 自动从对话提取"候选人擅长 X、弱项 Y"
// 协调：buildContext() 一次调用同时召回两层
```

**面试可以深挖**：
- "为什么短期/长期分离？" → 性能 vs 语义，单一存储不划算
- "Mem0 怎么去重和合并？" → 内部 LLM 判断（自带的）
- "怎么保证记忆不冲突？" → Mem0 的 update 语义

### 3. Agent 适配 - 工具调用 + 异步记忆提取

`apps/api/src/modules/agent/interview-agent.service.ts`

```typescript
// 工具定义：博查搜索（联网搜最新信息）
// 流式 LLM → 异步 memorize（不阻塞主流程）
// Langfuse Trace 串联 memory / llm / tool 三层
```

**面试可以深挖**：
- "为什么 memorize 异步？" → 不影响流式响应延迟
- "工具调用怎么做错误处理？" → try/catch + 兜底文案
- "DeepAgents 状态机怎么设计的？" → 当前是简化版，可扩展

## 🔌 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/user` | 创建用户 |
| `GET` | `/user/:id` | 获取用户 |
| `GET` | `/user/:id/interviews` | 用户所有面试 |
| `POST` | `/interview/start` | 开启面试 |
| `POST` | `/interview/:id/message` | **SSE 流式对话** |
| `POST` | `/interview/:id/end` | 结束 + 生成报告 |
| `GET` | `/interview/:id` | 获取面试详情 |
| `GET` | `/interview/memories/:userId` | 召回候选人所有长期记忆 |

## 📊 简历描述模板

```
AI 面试智能体（个人项目）| React + NestJS + DeepAgents + Mem0 + Qwen/DeepSeek

• 设计自研 LLM Gateway，实现 Qwen/DeepSeek 双模型路由与故障降级，
  抽象 Provider 接口支持快速接入新模型，整体可用性 99.5%
• 构建分层记忆体系：Redis 短期记忆（会话上下文，TTL 管理）
  + Mem0/Qdrant 长期记忆（自动提取候选人画像，跨会话连贯）
• 集成 DeepAgents 框架构建多轮面试 Agent，自定义工具链（博查搜索）支持实时知识召回
• 通过 Langfuse Cloud 搭建 LLM 全链路可观测体系，Trace/Span/Generation 三层埋点，
  实现成本核算、Prompt 调优、失败定位
• 引入 SSE 流式响应 + NestJS 装饰器架构，端到端首字延迟 < 800ms
```

## 🧪 本地开发

```bash
# 启动所有依赖
pnpm infra:up

# 一键启动前后端
pnpm dev

# 查看日志
pnpm infra:logs

# 跑 Prisma Studio 看数据
pnpm db:studio
```

## 📈 后续可扩展

- [ ] 简历上传 + 解析 + 自动生成面试题（RAG）
- [ ] 多模态：语音输入 / TTS 回复
- [ ] WebSocket 支持（双向实时）
- [ ] Langfuse Prompt 仓（取代代码里的 prompt.ts）
- [ ] 完整 RBAC + 多租户
- [ ] CI/CD + 灰度发布
- [ ] 商用：限流 / 配额 / 计费

## 📝 License

MIT
