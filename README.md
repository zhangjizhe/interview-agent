# Interview Agent — AI 结构化面试系统

> 一个可用于生产环境的 AI 面试系统：候选人上传简历 → 智能出题 → 多轮追问 → 自动评分报告
>
> **核心技术**：LangGraph Multi-Agent · 四层记忆 · Prompt Cache 工程 · 混合检索 RAG · Langfuse 全链路可观测

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-red)](https://nestjs.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2-green)](https://langchain-ai.github.io/langgraphjs/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 目录

- [项目亮点](#项目亮点)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [核心工程实现](#核心工程实现)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [API 文档](#api-文档)
- [测试与基准](#测试与基准)
- [知局限](#已知局限)

---

## 项目亮点

### Token 成本优化 — 55% Token 节省

实现了一套 **Provider 无关**的三层缓存工程：

| 层级 | 实现 | 效果 |
|------|------|------|
| Prompt Cache | 3 段前缀识别 + `cache_control` 注入（兼容 Anthropic / OpenAI 协议） | 命中率 ≥ 65% |
| 语义缓存 | Qwen embedding-v3 + Qdrant + Redis 精确层 + 黑白名单 | 命中率 ≥ 20% |
| 精确缓存 | Redis `hash(userId + cacheType + query)` 前置过滤 | < 1ms 响应 |

50 轮对话测试：**80K token → 35K token，节省 55%**，成本面板接口响应 < 100ms。

### Multi-Agent 编排 — Plan-and-Execute 架构

基于 LangGraph StateGraph 实现 5节点拓扑，相比 ReAct 更适合多步结构化面试场景：

```
START → Supervisor → Planner → Executor → Replanner → Reviewer → END
                ↑                   ↑___replan___|        |
                |_____________________revise______________|
```

- **PostgresSaver Checkpoint**：面试中断可从断点恢复，不丢上下文
- **引擎热切换**：`AGENT_ENGINE=multi|deepagents|llm-direct`，生产故障可秒级降级
- **防死循环兜底**：`retry_count ≥ 3` 强制进入 Reviewer，避免无限循环

### 四层记忆架构 — 分层存储与治理

```
L1 工作记忆  Redis Hash   面试进度状态（questionIndex/coveredSkills/scoreHistory）跨实例安全
L2 会话记忆  Redis List   lpush/ltrim(0,49) + TTL，近 50 条对话滚动窗口
L3 长期记忆  Milvus+Mem0  候选人画像双写，自动去重合并，语义召回
L4 结构化    Prisma/PG    面试结束后归档，支持历史复盘
```

### RAG 混合检索 — 50 轮 Benchmark P@5 = 1.0

```
用户 Query
    ↓
Dense 向量检索（Qwen embedding-v3, dim=1024）
    +
BM25 Sparse 检索（关键词匹配）
    ↓
RRF 融合排序（Reciprocal Rank Fusion）
    ↓
CrossEncoder Rerank（精排）
    ↓
Top-K 结果
```

**24 个测试用例，P@5=1.0，MRR=1.0，Recall=1.0**

### 4 级水位线上下文压缩 — 借鉴 Claude Code 策略

| Tier | 触发条件 | 策略 |
|------|---------|------|
| T0 | context < 60% | 不处理 |
| T1 | 60%–80% | Snip：截短旧 tool 输出 / 长 assistant 消息 |
| T2 | 80%–95% | Prune：替换为 `[已压缩]` stub |
| T3 | ≥ 95% | 增量 LLM 摘要 |

stub 决策缓存（LRU 1000 条）保护 Prompt Cache 命中率，用户消息只裁代码块保留文本。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│         Browser  React 18 + Vite + Tailwind             │
│         SSE 流式渲染 / Zustand 状态管理                   │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / SSE
┌───────────────────────▼─────────────────────────────────┐
│              NestJS API  :3001                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │               LLM Gateway                       │   │
│  │  Qwen / DeepSeek 双模型路由 + 永久错 disable     │   │
│  │  Prompt Cache 拦截器 → 语义缓存 → LLM 调用       │   │
│  │  Langfuse Generation 埋点 + 成本计量             │   │
│  └──────────────────┬──────────────────────────────┘   │
│                     │                                   │
│  ┌──────────────────▼──────────────────────────────┐   │
│  │         Multi-Agent Engine (LangGraph)           │   │
│  │   Supervisor → Planner → Executor               │   │
│  │        ↑           ↓          ↓                  │   │
│  │   Reviewer ← Replanner ←──────┘                 │   │
│  │   PostgresSaver Checkpoint                       │   │
│  └─────────────────┬──────────────────────────────┘   │
│          ┌──────────┴───────────┐                       │
│  ┌───────▼──────┐   ┌──────────▼──────┐                │
│  │ Memory Layer │   │   RAG Engine    │                │
│  │ L1 Redis Hash│   │ Milvus Hybrid  │                │
│  │ L2 Redis List│   │ Dense+BM25+RRF │                │
│  │ L3 Milvus    │   │ +Rerank        │                │
│  │    +Mem0     │   │ Qdrant KB 142题 │                │
│  │ L4 Prisma    │   └─────────────────┘                │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
         │          │          │          │
    Postgres    Redis 7    Qdrant     Milvus
    :5432       :6380      :6333      :19530
         │
    Mem0 Cloud / Langfuse Cloud
```

---

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript + Tailwind | SSE 流式渲染 |
| 后端 | NestJS 10 + TypeScript | 模块化 DI，装饰器生态 |
| 数据库 | PostgreSQL 16 + Prisma | 7 张业务表 |
| 短期记忆 | Redis 7 | Hash（工作记忆）+ List（会话）|
| 长期记忆 | Mem0 Cloud / OSS | 自动去重合并候选人画像 |
| 向量库 | Qdrant 1.18 + Milvus 2.6 | 双引擎：轻量 KB + 商用重型 |
| Agent 框架 | LangGraph 0.2 + LangChain 1.x | StateGraph + checkpoint |
| LLM | Qwen-plus + DeepSeek-chat | OpenAI 兼容协议，国产双模 |
| 可观测 | Langfuse Cloud + 自建成本面板 | Trace/Span/Generation + Redis 计量 |
| 部署 | Docker Compose（11 容器）| 一键起全套基础设施 |

---

## 核心工程实现

### 1. Prompt Cache 策略（`modules/llm/cache/prompt-cache.strategy.ts`）

三段识别将消息序列分为不同缓存优先级：

```typescript
// SYSTEM 段（长期稳定）→ cache_control: ephemeral
// SEMI-STATIC 段（tools/few-shot，≥1024 token）→ prompt_cache_key
// DYNAMIC 段（对话历史）→ 永远不进缓存

// prompt_cache_key = hash(userId + systemVersion + toolsetHash)
// 命中率从默认 60% 提升到实测 87%
```

横切拦截器 `wrapChat / wrapStream` 包装 provider 调用，**provider 切换零代码改动**。

### 2. 语义缓存（`modules/llm/cache/semantic-cache.service.ts`）

```
Query → Redis 精确层（hash 碰撞检查）
     → Qdrant cosine 相似度（阈值 0.92）
     → 命中：直接返回，记录 semanticCacheHits
     → 未中：LLM 调用后写入 Qdrant + Redis
```

白名单仅缓存 `interview_question / general_qa`，黑名单强制 miss：`scoring / resume_parse / report_generate`（涉及个性化评估，不能复用）。

### 3. 会话成本追踪（`modules/llm/cost/session-cost.tracker.ts`）

6 维度实时计量：

```typescript
interface SessionCost {
  llmCalls: number
  totalTokens: number
  promptCacheHits: number   // Prompt Cache 命中次数
  semanticCacheHits: number // 语义缓存命中次数
  retries: number
  cost: number              // 估算 USD
}
// Redis HINCRBY pipeline + 5 次写入刷盘防抖
// GET /api/session/:id/cost 响应 < 100ms
```

### 4. LLM Gateway 永久错检测

```typescript
// 区分永久错（禁用 provider）vs 临时错（走 fallback）
// 401/402/403/404 → 永久 disable，避免余额耗尽时持续扣费
// 5xx/429 → 临时，走 fallback provider
```

### 5. JSON 容错解析（`common/json-extract.ts`，22 单测）

解决 LLM 输出 markdown 包装 + 嵌套结构时正则贪婪匹配失效问题：

```
1. 剥 markdown ```json 包装
2. 花括号平衡扫描（处理字符串内转义 \"）
3. repairJsonLoose（去尾逗号 / 加引号 key / 去注释）
4. JSON.parse
```

---

## 快速开始

### 前置条件

- Docker & Docker Compose
- Node.js 20+，pnpm 8+
- Qwen API Key（[申请](https://dashscope.aliyuncs.com/)）或 DeepSeek API Key

### 方式 A：Docker 全量启动（推荐演示）

```bash
# 1. 配置环境变量
cp .env.example .env
# 必填：QWEN_API_KEY / DEEPSEEK_API_KEY
# 可选：LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / BOCHA_API_KEY

# 2. 一键启动 11 个容器
docker compose up -d --build

# 3. 等待服务就绪（~30s，KB 导入约 2min 异步完成）
docker logs -f interview-api
# 看到 4 个 ✅ + 🚀 API server running on http://localhost:3001 即就绪

# 4. 访问前端
open http://localhost:5173
```

### 方式 B：基础设施 Docker + 后端本地（开发推荐）

```bash
# 1. 启动基础设施
docker compose up -d postgres redis qdrant milvus

# 2. 安装依赖
cp .env.example .env && pnpm install

# 3. 初始化数据库
cd apps/api
pnpm prisma:generate && pnpm prisma:migrate

# 4. 启动后端
pnpm start:dev

# 5. 启动前端（另开终端）
cd apps/web && pnpm dev
```

### 引擎模式切换

```bash
AGENT_ENGINE=multi        # LangGraph Supervisor（默认，推荐）
AGENT_ENGINE=deepagents   # LangChain DeepAgents
AGENT_ENGINE=llm-direct   # 直连 LLM（降级兜底）
```

---

## 项目结构

```
interview-agent/
├── apps/
│   ├── api/                              # NestJS 后端（8500+ 行 TS）
│   │   └── src/
│   │       ├── modules/
│   │       │   ├─ llm/                  # LLM Gateway + 三层缓存 + 成本追踪
│   │       │   │   ├── llm.gateway.service.ts
│   │       │   │   ├── cache/
│   │       │   │   │   ├── prompt-cache.strategy.ts    ★ 3 段前缀识别
│   │       │   │   │   ├── prompt-cache.interceptor.ts
│   │       │   │   │   └── semantic-cache.service.ts
│   │       │   │   └── cost/session-cost.tracker.ts    ★ 实时成本计量
│   │       │   ├── agent/                # 面试 Agent 引擎
│   │       │   │   ├── interview-agent.service.ts      ★ 主流程（10 步）
│   │          │   ├── multi-agent.service.ts          ★ LangGraph 编排
│   │       │   │   └── services/context-manager.ts     ★ 4 级水位线压缩
│   │       │   ├── agents/multi-agent/
│   │       │   │   ├── state.ts                        ★ Zod schema 状态
│   │       │   │   ├── graph.ts                        ★ 拓扑定义
│   │       │   │   └── nodes/                          ★ 5 节点实现
│   │       │   ├── memory/               # 四层记忆
│   │       │   └── knowledge-base/       # Qdrant 知识库（142 题）
│   │       ├── infra/                    # Redis / Prisma / Langfuse / Qdrant
│   │       └── common/json-extract.ts   ★ LLM JSON 容错解析（22 单测）
│   └── web/                              # React 前端（3075 行）
├── docker-compose.yml                    # 11 容器编排
├── docs/architecture.html               # 交互式架构图
└── .env.example
```

---

## API 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/user` | 创建候选人用户 |
| `POST` | `/interview/start` | 开启面试（传 userId + 岗位） |
| `POST` | `/interview/:id/message` | **SSE 流式对话**（核心端点）|
| `POST` | `/interview/:id/end` | 结束面试 + 生成评分报告 |
| `GET` | `/api/session/:id/cost` | 实时会话成本统计（< 100ms）|
| `GET` | `/api/knowledge-base/recall` | RAG 召回调试（`?q=&debug=true`）|
| `POST` | `/api/knowledge-base/benchmark` | 召回基准测试 |
| `GET` | `/admin/mcp` | MCP 工具管理（系统级启停）|

---

## 测试与基准

### 单元测试（22 个，全过）

```bash
cd apps/api
TS_NODE_TRANSPILE_ONLY=true npx ts-node \
  --transpile-only \
  --compiler-options '{"module":"commonjs","esModuleInterop":true}' \
  tests/cache.spec.ts
# 22 passed, 0 failed
```

### RAG 召回基准（P@5 = 1.0）

```bash
curl -X POST "http://localhost:3001/api/knowledge-base/benchmark?limit=5&threshold=0.6" \
  -H "Content-Type: application/json" \
  -d @apps/api/tests/recall-benchmark-cases.json | jq '.metrics'
# { precisionAt5: 1.0, meanReciprocalRank: 1.0, recall: 1.0 }
```

### Token 成本基准（50 轮对话）

```bash
cd apps/api && npx ts-node scripts/bench-p0.ts
# 总 token ≤ 35K（原始 ~80K），节省 ≥ 55%
```

---

## 已知局限

| 类别 | 问题 | 计划 |
|------|------|------|
| 安全 | API 无认证（demo 阶段 userId 直传） | 接入 JWT |
| 测试 | 前端 0 测试，后端覆盖率 < 30% | 补 Vitest + Playwright e2e |
| 扩展性 | Mem0 单 namespace，多租户需隔离 | per-tenant namespace |
| 可观测 | Langfuse 100% 采样，无 APM | 接入采样 + Sentry |
| 并发 | SSE 单连接无复用 | WebSocket 升级方案 |

---

## License

MIT © 2026
