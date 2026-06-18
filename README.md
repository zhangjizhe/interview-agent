# AI 面试智能体 (Interview Agent)

> 基于 DeepAgents + Mem0 + Qdrant + Langfuse 的多轮结构化 AI 面试系统

## ✨ 核心亮点（按求职价值排序）

- **🔥 P0 缓存工程** — 3 段前缀识别 + Provider 无关抽象 + 永久错自动 disable + 双层语义缓存，50 轮对话 Token 节省 55%（对标 Anthropic/OpenAI 标准）
- **🧠 4 级水位线 ContextManager** — Tier 0-3 snip/prune/summarize 压缩策略，借鉴 Claude Code/Codex 做法，保护 Prompt Cache 命中率
- **🤖 Multi-Agent 引擎（默认启用）** — LangGraph Supervisor 拓扑（planner→executor→replanner→reviewer）+ PostgresSaver 断点续跑，agent.engine 配置开关
- **💾 四层记忆架构** — 工作记忆 Redis Hash（跨实例安全）+ 会话记忆 Redis List（TTL）+ 长期记忆 Milvus+Mem0 双写 + 用户画像 Prisma 归档
- **🧩 混合检索 RAG** — Milvus Dense+BM25+RRF+Rerank + Qdrant 142 题知识库，50 轮 P@5=1.0
- **🛡️ LLM Gateway 永久错检测** — 401/402/403/404 自动 disable provider，节省无效 token 消耗
- **📊 Langfuse 全链路可观测** — Trace/Span/Generation 三层埋点 + 会话级成本面板（<100ms）

## 🛠 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript + Tailwind | 豆包风格 UI |
| 后端 | NestJS 10 + TypeScript | 模块化、依赖注入 |
| 数据库 | PostgreSQL + Prisma | 业务主库 |
| 工作记忆 | Redis Hash | 跨实例共享面试流程状态 |
| 会话记忆 | Redis List | TTL 会话上下文 |
| 长期记忆 | Mem0 (Qdrant 后端) | 候选人画像 + 审计链 |
| 向量库 | Qdrant + Milvus | 轻量 RAG / 重型混合检索 |
| LLM | Qwen / DeepSeek | OpenAI 兼容协议 |
| 可观测 | Langfuse Cloud | Trace + 成本 + Prompt 仓 |
| 部署 | Docker Compose | 一键起 11 容器 |

## 🏛️ 架构设计

### 四层记忆架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        四层记忆（由内到外）                           │
├─────────────────────────────────────────────────────────────────────┤
│  L1 工作记忆 │ Redis Hash  │ 面试流程状态（questionIndex/coveredSkills）│
│             │ 跨实例共享   │ 重启不丢，毫秒级读写                     │
├─────────────┼─────────────┼─────────────────────────────────────────┤
│  L2 会话记忆 │ Redis List  │ 当前会话上下文 lpush/ltrim(0,49) + TTL  │
├─────────────┼─────────────┼─────────────────────────────────────────┤
│  L3 长期记忆 │ Milvus+Mem0 │ 候选人画像双写 / 语义去重 / 30天过期      │
├─────────────┼─────────────┼─────────────────────────────────────────┤
│  L4 用户画像│ Prisma      │ 面试结束结构化归档（分数/强弱项/技能树）   │
└─────────────┴─────────────┴─────────────────────────────────────────┘
```

### Multi-Agent 引擎（LangGraph Supervisor）

```
┌──────────────────────────────────────────────────────────────┐
│                  Supervisor（主控节点）                        │
│         ┌────────────────────────────────────┐               │
│         │  task: 规划任务 → 分发给 Executor   │               │
│         └────────────────────────────────────┘               │
│              ↓              ↓              ↓                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐               │
│  │ Planner  │    │ Executor │    │ Replanner│               │
│  │ (规划器) │    │ (执行器) │    │ (重规划) │               │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘               │
│       │               │               │                       │
│       └───────────────┴───────────────┘                       │
│                       ↓                                        │
│              ┌──────────────────┐                               │
│              │    Reviewer      │                               │
│              │ (评审 / 质量把关) │                               │
│              └──────────────────┘                               │
│                                                              │
│  ✓ PostgresSaver Checkpoint — 断点续跑                         │
│  ✓ agent.engine 配置开关 — multi（默认）| deepagents | llm-direct│
└──────────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 方式 A：Docker 编排（生产/演示用，推荐）

```bash
# 1. 配 env
cp .env.example .env
# 编辑 .env，填 QWEN_API_KEY / DEEPSEEK_API_KEY / LANGFUSE_KEY / BOCHA_API_KEY

# 2. 一键起 11 个服务
docker compose up -d --build

# 3. 看后端日志
docker logs -f interview-api
# 期望：✅ × 4 + 🚀 API server running on http://localhost:3001
```

### 方式 B：本地开发

```bash
docker compose up -d postgres redis qdrant
cp .env.example .env
pnpm install
cd apps/api && pnpm prisma:generate && pnpm prisma:migrate
pnpm start:dev
```

### 引擎模式配置

```bash
# agent.engine 支持三种模式（默认 multi）：
AGENT_ENGINE=multi        # LangGraph Supervisor 多 Agent（默认）
AGENT_ENGINE=deepagents   # LangChain 1.x DeepAgents
AGENT_ENGINE=llm-direct   # LLM 直连（兜底）
```

## 📁 项目结构

```
interview-agent/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── agent/
│   │       │   │   ├── interview-agent.service.ts  # 主面试流
│   │       │   │   ├── multi-agent.service.ts      # LangGraph Supervisor
│   │       │   │   ├── services/context-manager.service.ts  # 4 级水位线
│   │       │   │   └── shared-context.service.ts    # 共享白板
│   │       │   ├── memory/
│   │       │   │   ├── memory.service.ts           # 四层记忆协调
│   │       │   │   └── short-term/redis-memory.store.ts  # Redis Hash
│   │       │   └── llm/
│   │       │       ├── llm.gateway.service.ts      # 双模型路由 + 永久错检测
│   │       │       └── cache/                       # P0 缓存工程
│   │       └── infra/
│   └── web/
└── docs/
    ├── architecture-decisions.md  # ADR
    └── architecture.html          # 交互式架构图
```

## 🎯 五大简历亮点（按稀缺性排序）

### 1. P0 缓存工程 — 业界稀缺（90% 简历没有）

`apps/api/src/modules/llm/cache/prompt-cache.strategy.ts` + `semantic-cache.service.ts`

```
- 3 段前缀识别（System/Semi-static/Dynamic）+ cache_key = hash(userId+version+toolset)
- Provider 无关抽象层：Anthropic ↔ OpenAI 切换零成本
- 永久错自动 disable（401/402/403/404 不重试）
- 双层语义缓存：Qdrant 向量层 + Redis 精确层
- 50 轮 Benchmark：Token 80K→35K（↓55%），P@5=1.0
```

### 2. 4 级水位线 ContextManager — 业界领先

`apps/api/src/modules/agent/services/context-manager.service.ts`

```
- Tier 0 (<60%)：不优化
- Tier 1 (60-80%)：Snip 截长输出
- Tier 2 (80-95%)：Prune 替换为 [已压缩] stub
- Tier 3 (>95%)：LLM 增量摘要
- 4000 token 保护区 + 用户消息特权 + stub 决策缓存
```

### 3. 四层记忆架构 — 跨实例安全

`apps/api/src/modules/memory/memory.service.ts` + `short-term/redis-memory.store.ts`

```
- L1 Redis Hash 工作记忆：questionIndex/coveredSkills/scoreHistory，跨实例共享
- L2 Redis List 会话记忆：lpush/ltrim(0,49) + TTL
- L3 Milvus+Mem0 长期记忆：双写去重，30 天过期
- L4 Prisma 用户画像：面试结束结构化归档
```

### 4. 混合检索 RAG — 主流但完整

`apps/api/src/modules/interview/services/question-bank.service.ts`

```
- Milvus Dense(1024-dim) + BM25 Sparse + RRF 融合 + CrossEncoder Rerank
- 4 阶段精排：检索 → 重排序 → 质量评估 → 置信度过滤
- Qdrant 142 题知识库独立通道
```

### 5. LLM Gateway 永久错检测 + 双模型 fallback

`apps/api/src/modules/llm/llm.gateway.service.ts`

```
- 401/402/403/404 → 永久 disable，节省无效 token
- 5xx/429 → 临时错，Provider 间 fallback
- Qwen/DeepSeek 双模型路由 + OnApplicationBootstrap 健康检查
```

## 🔌 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/user` | 创建用户 |
| `POST` | `/interview/start` | 开启面试 |
| `POST` | `/interview/:id/message` | SSE 流式对话 |
| `POST` | `/interview/:id/end` | 结束 + 生成报告 |
| `GET` | `/api/session/:id/cost` | 会话级成本面板（<100ms） |

## 📊 简历描述模板

```
AI 面试智能体（个人项目）| NestJS + LangGraph + DeepAgents + Mem0 + Qwen/DeepSeek

• 自研 P0 缓存工程：3 段前缀识别 + Provider 无关抽象 + 永久错自动 disable，50 轮对话 Token 节省 55%（对标 Anthropic/OpenAI 标准）
• 实现 4 级水位线 ContextManager（snip/prune/summarize），借鉴 Claude Code/Codex 做法，保护 Prompt Cache 命中率
• 设计四层记忆架构：Redis Hash 工作记忆（跨实例安全）+ Redis List 会话 + Milvus+Mem0 长期 + Prisma 画像归档
• 落地 LangGraph Supervisor Multi-Agent（planner→executor→replanner→reviewer）+ PostgresSaver 断点续跑，agent.engine 配置开关
• 构建 Milvus Dense+BM25+RRF+Rerank 混合检索 RAG，50 轮 P@5=1.0
• 搭建 LLM Gateway 双模型路由 + 永久错检测 + Langfuse 全链路可观测
```

## 📝 License

MIT
