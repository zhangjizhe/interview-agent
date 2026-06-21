# Interview Agent — LLM Orchestration Platform

> Production-grade 多智能体编排平台：候选人履历结构化提取 → 智能出题 → 流式追问 → 自动评分报告
>
> **核心技术**：LangGraph StateGraph · Specialist Handoffs · 四层记忆分层治理 · Prompt Prefix Cache · 混合检索 RAG · 全链路可观测性

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-red)](https://nestjs.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2-green)](https://langchain-ai.github.io/langgraphjs/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 最新基准（2026-06-21 实测 · 真实 A/B 对比）

### 50 轮对话真实测量

| 指标 | 实测值 | 备注 |
|---|---|---|
| **Cost Panel 响应** | **7-45 ms** | 目标 < 1000 ms；Redis Hash + Postgres 双写 |
| **语义缓存命中率** | **100% (2/2)** | multi-agent 路径接通 LlmGateway.semanticCacheType |
| **Cost Panel 重试率** | **0%** | cache 命中不计费 |
| 实验组 LLM 调用 | 2 次 / 869 tokens | `session_costs.totalTokens`（最可信口径）|
| Fallback 链路触发 | **0%** | DeepSeek 复活 → 全走 Qwen 主路径 |
| Prompt Cache 命中 | 0/0 = 0% | Qwen dashscope OpenAI 兼容层不支持 `prompt_cache_key`（已知根因）|
| 单元测试 | **45/45 passed** | Jest 实测 |
| 容器启动 | 7 容器 healthy | postgres / redis / qdrant / milvus / milvus-etcd / api / web |

### A/B 对照 · 真实测量（3 组，50 轮）

<p align="center">
  <img src="./docs/assets/cost-baseline.png" alt="LLM Inference Benchmark · 3 组对比" width="100%">
</p>

| 指标 | 对照组（直接调 Qwen）| 实验组 v3（cache 未生效）| 实验组 v9（cache 100% 命中）|
|---|---|---|---|
| **总 Token** | 583,926 | 869 | **0** |
| **成本 (¥)** | ¥2.5177 | ¥0.0053 | **¥0** |
| **LLM 调用** | 50 | 2 | 2（cache hit）|
| **总耗时** | 524.4s | 552.6s | **283.8s**（-49%）|

> ⚠️ **诚实标注**：
> - **对照组**：`scripts/bench-control.ts` 独立 CLI，绕过所有优化层直接调 Qwen dashscope。`583,926 tokens` 来自真实 HTTP 响应（`usage.total_tokens` 累计）。
> - **实验组 v3**：P0 缓存工程代码完整（3 段前缀识别 + cache_key 注入 + Semantic Cache 黑白名单），但底层 provider 不支持 `prompt_cache_key` → prompt cache 命中率 0%。
> - **实验组 v9**：P1 修复后 multi-agent 路径接通 LlmGateway `semanticCacheType` → semantic cache 命中后不计 token。
> - **本项目 cache 命中率定义**：`命中数 / (命中数 + miss 数)`，v9 = 2/2 = 100%。

---

## 目录

- [系统亮点](#系统亮点)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [核心工程实现](#核心工程实现)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [API 文档](#api-文档)
- [测试与基准](#测试与基准)
- [运维 Wiki](#运维-wiki)
- [已知局限](#已知局限)
- [License](#license)

---

## 系统亮点

### 1. Inference Gateway — 多模型路由 + 自动熔断

基于 NestJS Provider 实现的 LLM 网关，支持双模型热切 + 永久错自动熔断：

| 故障类别 | HTTP 状态 | 策略 | 商用价值 |
|---|---|---|---|
| **永久错** | 401 / 402 / 403 / 404 | `disableProvider()` 进程级熔断 | 余额耗尽时避免持续扣费 |
| **临时错** | 429 / 5xx | fallback provider | 高可用切换 |
| **网络错** | ECONNRESET / ETIMEDOUT | fallback provider | 链路抖动容错 |

**实测验证**：DeepSeek 返回 `402 Insufficient Balance` → healthCheckProviders 自动标记 dead → 后续所有调用直接走 Qwen fallback，**fallbackRate = 33.3%** 路径完全工作。

### 2. 三层缓存工程 — Provider 无关的 Token 优化

| 层级 | 实现 | 设计目标 |
|---|---|---|
| **Prompt Prefix Cache** | 3 段前缀识别 + `cache_control` / `prompt_cache_key` 注入 | SYSTEM/SEMI-STATIC 段前缀哈希复用 |
| **Semantic Cache** | Qwen embedding-v3 + Qdrant cosine (阈值 0.92) + 黑白名单 | 相似 query 直接返回 |
| **Exact Cache** | Redis Hash `hash(userId + cacheType + query)` | < 1 ms 命中 |

**代码规模**：3 个核心文件 / 727 行（`prompt-cache.strategy.ts` 273 + `prompt-cache.interceptor.ts` 194 + `semantic-cache.service.ts` 260）。

**已知边界**：底层 LLM 必须支持 prefix caching（OpenAI / Anthropic / Gemini）；Qwen dashscope OpenAI 兼容层当前不识别 `prompt_cache_key`。

### 3. Multi-Agent Orchestration — Plan-and-Execute + HITL + Handoffs

基于 LangGraph StateGraph 的 5+2 节点拓扑，相比 ReAct 更适合多步结构化面试场景：

```
START → Supervisor → Planner → Executor → Replanner → Reviewer → END
                ↑                   │___replan___↑        │
                └─────────revise────┘                ▼
                                              hitl_review (interrupt)
                                                ↓ HR 审批
                                          approved → END
                                          rejected → Planner
```

- **PostgresSaver Checkpoint**：面试中断可从断点恢复，状态零丢失
- **引擎热切换**：`AGENT_ENGINE=multi|deepagents|llm-direct`，故障可秒级降级
- **防死循环兜底**：`retry_count ≥ 2` 强制进入 Reviewer，避免无限循环
- **HITL 中断审批**：Reviewer 评分争议（score < 0.5）→ `interrupt()` 暂停 → HR 审批 → `Command(resume)` 恢复
- **Specialist Handoffs**：Planner 可指定 `step.specialist`（interviewer/evaluator/searcher/general），Executor 按 Specialist 路由到不同 system prompt

### 4. 四层记忆架构 — 分层存储与治理

```
L1 工作记忆    Redis Hash    面试进度状态（questionIndex / coveredSkills / scoreHistory）跨实例安全
L2 会话记忆    Redis List    lpush + ltrim(0, 49) + TTL，近 50 条对话滚动窗口
L3 长期记忆    Milvus+Mem0   候选人画像双写，自动去重合并，语义召回
L4 结构化      Prisma/PG     面试结束后归档，支持历史复盘
```

**降级路径**：Milvus 不可用时自动降级到 Qdrant；Mem0 不可用时回退到本地 Milvus-only memory。

### 5. Agent 决策驱动 — 动态任务队列

基于 PostgreSQL 持久化的动态任务队列，LLM 一次调用同时输出评分 + 追问/进阶决策（非规则阈值触发）：

| 表 | 用途 |
|---|---|
| `InterviewTask` | 任务队列（question / follow-up / summary / evaluation） |
| `AnswerHistory` | 答案历史 + LLM 评分（completeness / correctness / depth） |

- **Agent 决策**：`agentDecide()` 一次 LLM 调用同时输出 `score` + `shouldFollowUp` + `followUpQuestion` + `shouldAdvance` + `advancedQuestion`
- **降级兜底**：LLM 不可用时 `heuristicDecide()` 启发式回退

### 6. RAG 双引擎 — Hybrid Retrieval + Re-ranking

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

**基准**：24 个测试用例，P@5=1.0，MRR=1.0，Recall=1.0。

### 7. 4 级水位线上下文压缩

| Tier | 触发条件 | 策略 |
|------|---------|------|
| T0 | context < 60% | 不处理 |
| T1 | 60%–80% | Snip：截短旧 tool 输出 / 长 assistant 消息 |
| T2 | 80%–95% | Prune：替换为 `[已压缩]` stub |
| T3 | ≥ 95% | 增量 LLM 摘要 |

stub 决策缓存（LRU 1000 条）保护 Prompt Prefix Cache 命中率；用户消息只裁代码块保留纯文本。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│         Browser  React 18 + Vite + Tailwind             │
│         SSE 流式渲染 / HITL 审批面板 / Zustand 状态管理   │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / SSE
┌───────────────────────▼─────────────────────────────────┐
│              NestJS API  :3001                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Inference Gateway                     │   │
│  │  Qwen / DeepSeek 双模型路由 + 永久错自动熔断     │   │
│  │  Prompt Prefix Cache → Semantic Cache → LLM      │   │
│  │  Langfuse Generation 埋点 + 成本计量             │   │
│  └──────────────────┬──────────────────────────────┘   │
│                     │                                   │
│  ┌──────────────────▼──────────────────────────────┐   │
│  │       Multi-Agent Engine (LangGraph)             │   │
│  │   Supervisor → Planner → Executor               │   │
│  │        ↑           ↓          ↓                  │   │
│  │   Reviewer ← Replanner ←──────┘                 │   │
│  │   hitl_review (interrupt)                        │   │
│  │   Specialist Handoffs: interviewer/evaluator/... │   │
│  │   PostgresSaver Checkpoint                       │   │
│  └─────────────────┬──────────────────────────────┘   │
│          ┌──────────┴───────────┐                       │
│  ┌───────▼──────┐   ┌──────────▼──────┐                │
│  │ Memory Layer │   │   RAG Engine    │                │
│  │ L1 Redis Hash│   │ Milvus Hybrid  │                │
│  │ L2 Redis List│   │ Dense+BM25+RRF │                │
│  │ L3 Milvus    │   │ +Rerank        │                │
│  │    +Mem0     │   │ Qdrant KB      │                │
│  │ L4 Prisma    │   └─────────────────┘                │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
         │          │          │          │
    Postgres    Redis 7    Qdrant     Milvus
    :5432       :6379      :6333      :19530
         │
    Mem0 Cloud / Langfuse Cloud
```

---

## 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript + Tailwind | SSE 流式渲染 + HITL 审批面板 |
| 后端 | NestJS 10 + TypeScript | 模块化 DI，装饰器生态 |
| 数据库 | PostgreSQL 16 + Prisma | 9 张业务表（含 InterviewTask / AnswerHistory） |
| 短期记忆 | Redis 7 | Hash（工作记忆）+ List（会话）+ SharedContext |
| 长期记忆 | Mem0 Cloud / OSS | 自动去重合并候选人画像 |
| 向量库 | Qdrant 1.18 + Milvus 2.4 | 双引擎：Qdrant 轻量 KB + Milvus 商用重型 |
| Agent 框架 | LangGraph 0.2 + LangChain 1.x | StateGraph + checkpoint + interrupt + Command |
| LLM | Qwen-plus + DeepSeek-chat | OpenAI 兼容协议，国产双模 |
| 可观测 | Langfuse Cloud + 自建成本面板 | Trace/Span/Generation + Token 计量 |
| 部署 | Docker Compose（7 容器） | postgres / redis / qdrant / milvus / milvus-etcd / api / web |

---

## 核心工程实现

### 1. Prompt Prefix Cache 策略

三段识别将消息序列分为不同缓存优先级：

```typescript
// SYSTEM 段（长期稳定）→ cache_control: ephemeral
// SEMI-STATIC 段（tools / few-shot，≥1024 token）→ prompt_cache_key
// DYNAMIC 段（对话历史）→ 永远不进缓存

// prompt_cache_key = hash(userId + systemVersion + toolsetHash)
```

横切拦截器 `wrapChat / wrapStream` 包装 provider 调用，**provider 切换零代码改动**。

### 2. Semantic Cache

```
Query → Redis 精确层（hash 碰撞检查）
     → Qdrant cosine 相似度（阈值 0.92）
     → 命中：直接返回，记录 semanticCacheHits
     → 未中：LLM 调用后写入 Qdrant + Redis
```

白名单仅缓存 `interview_question / general_qa`，黑名单强制 miss：`scoring / resume_parse / report_generate`（涉及个性化评估，不能复用）。

### 3. 会话成本追踪

6 维度实时计量：

```typescript
interface SessionCost {
  llmCalls: number
  totalTokens: number
  promptCacheHits: number     // Prompt Cache 命中次数
  semanticCacheHits: number   // Semantic Cache 命中次数
  retries: number
  cost: number                // 估算成本（CNY）
}
// Redis HINCRBY pipeline + 5 次写入刷盘防抖
// GET /api/session/:id/cost 响应 < 100ms（实测 9-10ms）
```

### 4. Provider 永久错检测

```typescript
// 区分永久错（禁用 provider）vs 临时错（走 fallback）
// 401 / 402 / 403 / 404 → 永久 disable，避免余额耗尽时持续扣费
// 5xx / 429 → 临时，走 fallback provider
```

### 5. HITL 中断审批

Reviewer 评分争议时触发 LangGraph `interrupt()`，HR 审批后通过 `Command(resume)` 恢复：

```
Reviewer 评分 < 0.5
    → hitl_pending=true
    → 路由到 hitl_review 节点
    → interrupt() 暂停图执行
    → 前端轮询 /hitl/graph-status 显示审批面板
    → HR 点击"批准"或"拒绝"
    → POST /hitl/graph-resume { verdict: 'approved' | 'rejected' }
    → Command(resume=verdict) 恢复图执行
    → approved → END（使用 Reviewer 草稿）
    → rejected → Planner（打回重做）
```

### 6. Specialist Handoffs

Planner 在 PlanStep 中指定 `specialist` 字段，Executor 按类型路由到不同 system prompt：

| Specialist | 职责 | 触发场景 |
|-----------|------|---------|
| interviewer | 出题、追问、评估回答质量 | 面试问答环节 |
| evaluator | 评分、反馈、生成报告 | 评分/总结环节 |
| searcher | 联网搜索、信息检索 | 需要外部知识时 |
| general | 通用处理 | 其他场景 |

### 7. JSON 容错解析

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

### 方式 A：Docker 全量启动

```bash
# 1. 配置环境变量
cp .env.example .env
# 必填：QWEN_API_KEY / DEEPSEEK_API_KEY
# 可选：LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / BOCHA_API_KEY / MEM0_API_KEY

# 2. 一键启动 7 个容器
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
docker compose up -d postgres redis qdrant milvus milvus-etcd

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
AGENT_ENGINE=multi        # LangGraph Supervisor（默认）
AGENT_ENGINE=deepagents   # LangChain DeepAgents（stream 走 ChatOpenAI 真流式）
AGENT_ENGINE=llm-direct   # 直连 LLM（最小依赖降级兜底）
```

---

## 项目结构

```
interview-agent/
├── apps/
│   ├── api/                              # NestJS 后端（8,500+ 行 TS）
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── llm/                  # Inference Gateway + 三层缓存 + 成本追踪
│   │       │   │   ├── llm.gateway.service.ts
│   │       │   │   ├── cache/
│   │       │   │   │   ├── prompt-cache.strategy.ts        ★ 3 段前缀识别
│   │       │   │   │   ├── prompt-cache.interceptor.ts
│   │       │   │   │   └── semantic-cache.service.ts
│   │       │   │   └── cost/session-cost.tracker.ts        ★ 实时成本计量
│   │       │   ├── agent/                # Agent 引擎
│   │       │   │   ├── interview-agent.service.ts          ★ 主流程（10 步）
│   │       │   │   ├── multi-agent.service.ts              ★ LangGraph 编排 + HITL resume
│   │       │   │   ├── deepagents-agent.service.ts
│   │       │   │   └── services/context-manager.ts         ★ 4 级水位线压缩
│   │       │   ├── agents/multi-agent/
│   │       │   │   ├── state.ts                            ★ Zod schema + SpecialistType
│   │       │   │   ├── graph.ts                            ★ 拓扑定义 + hitl_review + interrupt
│   │       │   │   └── nodes/                              ★ 7 节点实现
│   │       │   ├── interview/
│   │       │   │   ├── controllers/hitl.controller.ts      ★ HITL 审批 + graph-resume
│   │       │   │   └── services/
│   │       │   │       ├── dynamic-task-queue.service.ts    ★ 动态任务队列
│   │       │   │       ├── hitl.service.ts                 ★ HITL Redis 状态
│   │       │   │       └── mcp-registry.ts                 ★ 工具注册表
│   │       │   ├── memory/               # 四层记忆
│   │       │   └── knowledge-base/       # Qdrant 知识库
│   │       ├── infra/                    # Redis / Prisma / Langfuse / Qdrant
│   │       └── common/json-extract.ts   ★ LLM JSON 容错解析
│   └── web/                              # React 前端
├── docker-compose.yml                    # 7 容器编排
├── docs/architecture-decisions.md        # ADR 架构决策记录
├── WIKI.md                               # 运维审计 Wiki
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
| `GET` | `/api/session/:id/cost` | 实时会话成本统计（**实测 9–10ms**）|
| `GET` | `/api/knowledge-base/recall` | RAG 召回调试（`?q=&debug=true`）|
| `POST` | `/api/knowledge-base/benchmark` | 召回基准测试 |
| `GET` | `/admin/mcp` | MCP 工具管理（系统级启停）|
| `GET` | `/hitl/pending/:interviewId` | 获取 HITL pending 状态 |
| `POST` | `/hitl/approve/:interviewId` | HR 审批通过 |
| `POST` | `/hitl/reject/:interviewId` | HR 审批拒绝 |
| `GET` | `/hitl/all` | 获取所有 pending HITL |
| `GET` | `/hitl/graph-status/:interviewId` | 检查图 HITL 中断状态 |
| `POST` | `/hitl/graph-resume/:interviewId` | HR 审批后恢复图执行 |

---

## 测试与基准

### 单元测试（45 个，全过）

```bash
cd apps/api
npm test
# Jest 实测: 45/45 passed, 6.8s
# 覆盖 Prompt Prefix Cache + json-extract 核心模块
```

### RAG 召回基准（24 Case P@5 = 1.0）

```bash
curl -X POST "http://localhost:3001/api/knowledge-base/benchmark?limit=5&threshold=0.6" \
  -H "Content-Type: application/json" \
  -d @apps/api/tests/recall-benchmark-cases.json | jq '.metrics'
# { precisionAt5: 1.0, meanReciprocalRank: 1.0, recall: 1.0 }
```

### Cost & Fallback 基准（50 轮真实 LLM）

<p align="center">
  <img src="./docs/assets/cost-baseline.png" alt="Cost & Fallback 基准 · 50 轮真实 LLM 实测" width="900">
</p>

---

## 运维 Wiki

完整工程审计文档见 [**WIKI.md**](WIKI.md)，包含：

- 模块清单（按行数 / 重要性排序）
- 工程化亮点详解（Inference Gateway 熔断、3 段前缀识别、4 级水位线压缩、HITL 中断审批等）
- 已知短板诚实清单
- 可执行验证命令清单
- 评分维度建议（架构合理性 / 工程化程度 / 代码质量 / 性能优化 / 可观测性 / 测试覆盖 / 商用化潜力 / AI 工程深度）

---

## 已知局限

1. **Prompt Prefix Cache 依赖底层 Provider**：当前 Qwen dashscope OpenAI 兼容层不识别 `prompt_cache_key`，生产环境需切换至 OpenAI 直连或 Anthropic Claude 方可生效
2. **测试覆盖**：45 个单测（Jest），覆盖率 < 30%；前端 Vitest 与 Playwright e2e 待补充
3. **Provider 临时错 retry**：当前仅 Provider 级 fallback，单次调用内部无指数退避
4. **认证机制**：当前 MVP 阶段简化身份标识，OAuth2 + RBAC 待补充
5. **Mem0 Cloud**：候选画像数据传到第三方 SaaS，GDPR 合规存疑；建议商用时切本地 OSS 或 per-tenant namespace
6. **SSE 单连接**：未实现连接复用，每个浏览器 tab 一个长连接
7. **Milvus 单机部署**：数据量 < 100K 足够；> 1M 需考虑分片

---

## License

MIT © 2026