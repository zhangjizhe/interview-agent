# AI 面试智能体 (Interview Agent)

> 基于 DeepAgents + Mem0 + Qdrant + Langfuse 的多轮结构化 AI 面试系统
> 
> **架构演进**: 从中心化 Coordinator-Executor 架构 → 借鉴 DeLM 去中心化共享上下文设计

## ✨ 核心亮点

- **🧠 多模型 LLM Gateway** — Qwen + DeepSeek 双模型路由、故障自动降级、Token 计量
- **💾 分层记忆体系** — Redis 短期记忆（会话上下文）+ Mem0 长期记忆（候选人画像）+ 过期策略 + 审计链
- **🤖 DeepAgents 适配** — 工具调用、状态管理、自定义工具链（博查搜索）
- **📊 Langfuse 全链路可观测** — Trace/Span/Generation 三层埋点、成本核算
- **⚡ SSE 流式对话** — 首字延迟 < 800ms，实时打字机效果（已修复 React batching 问题）
- **🏗 NestJS 模块化架构** — 清晰分层、依赖注入、易测试易扩展
- **🔄 共享上下文白板** — 借鉴 DeLM 设计，Agent 间直接读写，消除中心控制器瓶颈
- **🎯 动态任务队列** — 根据候选人表现自适应生成问题，支持跟进提问和进阶题目
- **📚 RAG 分层展开** — 精要优先、按需展开，优化上下文利用率

## 🛠 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript + Tailwind | 豆包风格 UI |
| 后端 | NestJS 10 + TypeScript | 模块化、装饰器、DI |
| 数据库 | PostgreSQL + Prisma | 业务主库 |
| 短期记忆 | Redis 7 | 会话上下文 + 限流 |
| 长期记忆 | Mem0 (Qdrant 后端) | 候选人画像 + 审计链 |
| 向量库 | Qdrant | 持久化、metadata 过滤 |
| LLM | Qwen / DeepSeek | OpenAI 兼容协议 |
| 可观测 | Langfuse Cloud | Trace + 成本 + Prompt 仓 |
| 搜索 | 博查 AI | Agent 联网工具 |
| 部署 | Docker Compose | 一键起本地环境（含 API） |

## 🏛️ 架构设计（DeLM 去中心化启发）

### 去中心化共享上下文

```
┌─────────────────────────────────────────────────────────────┐
│                     Shared Context (白板)                    │
│  ┌─────────┬─────────┬─────────┬─────────┬───────────────┐  │
│  │  Gist   │  Gist   │  Gist   │  Gist   │   ...         │  │
│  │ (精要)  │ (精要)  │ (精要)  │ (精要)  │               │  │
│  ├─────────┼─────────┼─────────┼─────────┼───────────────┤  │
│  │ Details │ Details │ Details │ Details │   ...         │  │
│  │ (详情)  │ (详情)  │ (详情)  │ (详情)  │               │  │
│  └─────────┴─────────┴─────────┴─────────┴───────────────┘  │
│  ✓ 写入验证器 | ✓ 过期策略 | ✓ 审计链                        │
└─────────────────────────────────────────────────────────────┘
           ↑         ↑         ↑         ↑
           │         │         │         │
    ┌──────┴──┐ ┌────┴──┐ ┌────┴──┐ ┌────┴──┐
    │ Agent 1 │ │ Agent 2│ │ Agent 3│ │ Agent N│
    │ (面试官) │ │ (知识库)│ │ (分析器)│ │ (总结器)│
    └─────────┘ └────────┘ └────────┘ └────────┘
```

**设计优势**:
- **消除中心瓶颈**: Agent 直接读写共享上下文，无需主控转发
- **分层展开**: 精要常驻内存，详情按需加载（类似操作系统虚拟内存）
- **写入验证**: 每条记录写入前验证，防止错误传播
- **自动清理**: TTL 过期 + 访问频率清理，防止记忆膨胀

### 动态任务队列

```
┌──────────────────────────────────────────────────────────────┐
│                    Dynamic Task Queue                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Task 1      │    │ Task 2      │    │ Task 3      │     │
│  │ (priority 1)│    │ (priority 2)│    │ (priority 3)│     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                  │              │
│         ▼                  ▼                  ▼              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │           Answer Quality Evaluation                  │   │
│  │  score < 0.5 → 生成跟进问题                          │   │
│  │  score > 0.8 → 生成进阶问题                          │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

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

### 方式 B：基础设施 Docker + 后端本地 Node（开发推荐）

```bash
docker compose up -d postgres redis qdrant
cp .env.example .env
pnpm install
cd apps/api && pnpm prisma:generate && pnpm prisma:migrate
pnpm start:dev
```

### 启动前端

```bash
cd apps/web
pnpm dev
# 浏览器打开 http://localhost:5173
```

## 📁 项目结构

```
interview-agent/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── agent/
│   │       │   │   └── shared-context.service.ts  # DeLM 共享白板
│   │       │   ├── memory/
│   │       │   │   └── memory.service.ts          # 记忆层 + 审计链
│   │       │   └── interview/
│   │       │       └── services/
│   │       │           ├── dynamic-task-queue.service.ts
│   │       │           └── rag.service.ts
│   │       └── schemas/question.schema.ts
│   └── web/
│       └── src/
│           ├── store/interview-store.ts
│           └── hooks/useInterviewStream.ts
├── packages/shared-types/
└── README.md
```

## 🎯 五大简历亮点

### 1. LLM Gateway - 多模型路由 + 故障降级

### 2. 共享上下文白板（DeLM 启发）

`apps/api/src/modules/agent/shared-context.service.ts`

### 3. ContextManager - 4 级水位线上下文压缩

### 4. 记忆层 - 短期/长期分离 + 审计链

`apps/api/src/modules/memory/memory.service.ts`

### 5. 动态任务队列 - 自适应面试

`apps/api/src/modules/interview/services/dynamic-task-queue.service.ts`

## 🔌 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/user` | 创建用户 |
| `POST` | `/interview/start` | 开启面试 |
| `POST` | `/interview/:id/message` | SSE 流式对话 |
| `POST` | `/interview/:id/end` | 结束 + 生成报告 |

## 📊 简历描述模板

```
AI 面试智能体（个人项目）| React + NestJS + DeepAgents + Mem0 + Qwen/DeepSeek

• 设计自研 LLM Gateway，实现 Qwen/DeepSeek 双模型路由与故障降级
• 构建分层记忆体系：Redis 短期记忆 + Mem0/Qdrant 长期记忆 + 审计链治理技术债
• 借鉴 DeLM 去中心化设计，实现共享上下文白板，消除中心控制器瓶颈
• 实现动态任务队列，根据候选人回答质量自适应生成跟进/进阶问题
• 通过 Langfuse Cloud 搭建 LLM 全链路可观测体系
• 引入 SSE 流式响应 + Zustand 状态管理，端到端首字延迟 < 800ms
```

## 📝 License

MIT