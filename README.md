# Interview Agent — AI 面试智能体

> 基于 LangGraph + DeepAgents + Mem0 + Qdrant + Langfuse 的多轮结构化 AI 面试系统

## 功能特性

- **🧠 多级 LLM 路由** — Qwen + DeepSeek 双模型自动切换、故障降级、Token 计量与成本统计
- **🔥 Prompt 缓存工程** — 3 段前缀识别 + Provider 无关抽象 + 永久错自动 disable + 双层语义缓存，50 轮对话 Token 节省 55%
- **📦 四层记忆架构** — 工作记忆（Redis Hash，跨实例安全）→ 会话记忆（Redis List，TTL）→ 长期记忆（Milvus + Mem0 双写）→ 用户画像（Prisma 结构化归档）
- **📉 4 级水位线 ContextManager** — Tier 0-3 snip/prune/summarize 压缩策略，保护 Prompt Cache 命中率
- **🤖 Multi-Agent 引擎** — LangGraph Supervisor 拓扑（planner→executor→replanner→reviewer）+ PostgresSaver 断点续跑，支持运行时引擎切换
- **🧩 混合检索 RAG** — Milvus Dense + BM25 Sparse + RRF + CrossEncoder Rerank，50 轮 benchmark P@5=1.0
- **⚡ SSE 流式对话** — 首字延迟 < 800ms，实时打字机效果
- **📊 Langfuse 全链路可观测** — Trace/Span/Generation 三层埋点 + 会话级成本面板（<100ms）

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + Vite + TypeScript + Tailwind |
| 后端 | NestJS 10 + TypeScript |
| 数据库 | PostgreSQL + Prisma |
| 缓存 / 记忆 | Redis 7 |
| 向量库 | Qdrant + Milvus |
| 长期记忆 | Mem0 |
| Agent 框架 | LangGraph + DeepAgents (LangChain 1.x) |
| LLM | Qwen / DeepSeek |
| 可观测 | Langfuse Cloud |
| 部署 | Docker Compose |

## 架构设计

### 四层记忆架构

```
┌──────────────────────────────────────────────────────────────┐
│  L1 工作记忆  │  Redis Hash  │ 面试流程状态                   │
│              │              │ questionIndex / coveredSkills  │
├──────────────┼──────────────┼───────────────────────────────┤
│  L2 会话记忆  │  Redis List  │ lpush/ltrim(0,49) + TTL        │
├──────────────┼──────────────┼───────────────────────────────┤
│  L3 长期记忆  │ Milvus+Mem0  │ 候选人画像双写 / 语义去重        │
├──────────────┼──────────────┼───────────────────────────────┤
│  L4 用户画像  │   Prisma     │ 面试结束结构化归档               │
└──────────────┴──────────────┴───────────────────────────────┘
```

### Multi-Agent 引擎（LangGraph Supervisor）

```
┌──────────────────────────────────────────────────────────┐
│              Supervisor（主控节点）                        │
│   ┌───────────────────────────────────────┐             │
│   │  task: 规划任务 → 分发给 Executor       │             │
│   └───────────────────────────────────────┘             │
│         ↓          ↓          ↓                         │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐                 │
│  │ Planner │ │ Executor │ │ Replanner│                 │
│  └────┬────┘ └────┬─────┘ └────┬─────┘                 │
│       │           │            │                         │
│       └───────────┴────────────┘                         │
│                     ↓                                    │
│           ┌──────────────────┐                           │
│           │     Reviewer     │                           │
│           └──────────────────┘                           │
│                                                          │
│  ✓ PostgresSaver Checkpoint — 断点续跑                    │
│  ✓ agent.engine 配置开关 — multi/deepagents/llm-direct    │
└──────────────────────────────────────────────────────────┘
```

## 快速开始

### Docker Compose（推荐）

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 QWEN_API_KEY / DEEPSEEK_API_KEY / LANGFUSE_KEY / BOCHA_API_KEY

# 2. 一键启动
docker compose up -d --build

# 3. 查看后端日志
docker logs -f interview-api
```

### 本地开发

```bash
# 启动基础服务
docker compose up -d postgres redis qdrant

# 安装依赖
cp .env.example .env
pnpm install

# 初始化数据库
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate

# 启动开发服务器
pnpm start:dev
```

### 引擎模式配置

通过 `agent.engine` 环境变量控制运行时引擎：

```bash
AGENT_ENGINE=multi          # LangGraph Supervisor 多 Agent（默认）
AGENT_ENGINE=deepagents     # LangChain 1.x DeepAgents
AGENT_ENGINE=llm-direct     # LLM 直连（兜底降级）
```

## 项目结构

```
interview-agent/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── agent/
│   │       │   │   ├── interview-agent.service.ts
│   │       │   │   ├── multi-agent.service.ts
│   │       │   │   ├── services/context-manager.service.ts
│   │       │   │   └── shared-context.service.ts
│   │       │   ├── memory/
│   │       │   │   ├── memory.service.ts
│   │       │   │   └── short-term/redis-memory.store.ts
│   │       │   ├── interview/
│   │       │   │   └── services/question-bank.service.ts
│   │       │   └── llm/
│   │       │       ├── llm.gateway.service.ts
│   │       │       └── cache/
│   │       │           ├── prompt-cache.strategy.ts
│   │       │           ├── prompt-cache.interceptor.ts
│   │       │           └── semantic-cache.service.ts
│   │       └── infra/
│   └── web/
├── docs/
│   ├── architecture-decisions.md    # ADR
│   └── architecture.html            # 交互式架构图
└── docker-compose.yml
```

## API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/user` | 创建用户 |
| `POST` | `/interview/start` | 开启面试 |
| `POST` | `/interview/:id/message` | SSE 流式对话 |
| `POST` | `/interview/:id/end` | 结束面试 + 生成报告 |
| `GET` | `/api/session/:id/cost` | 会话级成本统计 |

## License

MIT
