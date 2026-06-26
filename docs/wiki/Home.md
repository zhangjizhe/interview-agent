# Wiki · 项目知识库

> 2026-06-26 · 当前架构：**NestJS api (3001) 默认 + py-api (3002) 选配**
>
> GH Wiki 未启用时，此目录作为项目内 wiki 入口；启用后可用 `gh api import` 同步到 `zhangjizhe/interview-agent.wiki`。

---

## 目录

- [项目简介](#项目简介)
- [快速开始](#快速开始)
- [架构总览](#架构总览)
- [接口清单](#接口清单)
- [商用部署](#商用部署)
- [故障排查](#故障排查)
- [简历亮点](#简历亮点)
- [CI 流水线](#ci-流水线)
- [贡献指南](#贡献指南)

---

## 项目简介

**interview-agent** —— AI 面试智能体，面向 LLM Agent 工程师求职场景的简历项目。

**核心能力**：

- 多 Agent 编排（LangGraph StateGraph · 6 节点：supervisor / planner / executor / replanner / reviewer / hitl_review）
- 4 层记忆分层（Postgres + Redis + Qdrant + Milvus）
- 双 LLM 路由（Qwen / DeepSeek，自动 fallback）
- 真流式输出（SSE · asyncio.Queue）
- 4 级水位线上下文压缩
- 27 个接口（NestJS 默认）+ 24 个接口（py-api 选配）
- 商用 best practice：结构化日志 / Rate Limit / Metrics / 错误处理 / 真流式 / 双层 fail-fast

**技术栈**：NestJS + Python (FastAPI) + React + LangGraph 1.x + DeepAgents + Mem0 + Qdrant + Milvus + Qwen / DeepSeek + Langfuse + Prisma + Docker

---

## 快速开始

### 一键部署（默认 NestJS 后端）

```bash
git clone https://github.com/zhangjizhe/interview-agent
cd interview-agent
bash deploy.sh
# → 自动 .env + openssl rand JWT_SECRET
# → docker compose up -d --build
# → 等 api healthy
# → 端到端验证 /api/health + /api/health/ready
```

### 选配启 py-api（Python 薄壳版）

```bash
bash deploy.sh --py
# → 8 容器（NestJS 默认）+ 1 容器（py-api profile 选配）
# → 注意：web 默认反代 api:3001，要用 py-api 需手动改 web/nginx.conf 后重 build
```

### 商用前必做

```bash
# 1. 编辑 .env 填 QWEN_API_KEY（必须）
# 2. 重生成 JWT_SECRET
openssl rand -base64 48  # 替换 .env 的 JWT_SECRET
# 3. 重启加载新 env
bash deploy.sh
```

详见 [deploy.sh 注释](../deploy.sh) + [architecture.md](./architecture.md)。

---

## 架构总览

**当前架构（2026-06-26 架构回退后）**：

- **默认后端**：NestJS（apps/api · 端口 3001）
- **选配后端**：py-api（apps/py-api · 端口 3002，profile 启）
- **前端**：React + Vite（apps/web · 端口 5173，nginx 反代到 api:3001）
- **基础设施**：Postgres + Redis + Qdrant + Milvus（双后端共享）

详见 [architecture.md](./architecture.md)（含 Mermaid 架构图 + 选型理由）。

---

## 接口清单

### NestJS（apps/api · 27 接口）

| 模块 | 端点数 | 主要路由 |
|------|------|---------|
| Auth | 1 | `/api/auth/login` |
| Health | 2 | `/api/health` · `/api/health/ready` |
| Interview | 11 | `/api/interview/{start,stream,upload-resume,list,stats,{id},{id}/end,{id}/confirm-resume,{id}/message,empty-rooms}` |
| Question Bank | 5 | `/api/interview/question-bank/*` |
| Knowledge Base | 4 | `/api/knowledge-base/*` |
| Tools | 1 | `/api/tools` |
| MCP Admin | 4 | `/api/admin/mcp-servers/*` |
| Metrics | 1 | `/api/metrics/vitals` |
| HITL | 3 | `/api/hitl/*` |

### py-api（apps/py-api · 24 接口）

按 P0/P1/P2 优先级分（见 [docs/architecture.md](./architecture.md) § py-api 接口清单）。

---

## 商用部署

详见 [runbook.md](./runbook.md) + [deploy.sh 注释](../deploy.sh)。

**双层 fail-fast**：

1. docker compose `${VAR:?msg}` 启动前 fail-fast（基础设施起来前）
2. NestJS ConfigService fail-fast（JWT_SECRET 商用模式必填）

---

## 故障排查

[runbook.md](./runbook.md) —— 4 个高频故障场景 + 排查步骤 + 修复命令：

1. JWT_SECRET 报错（启动失败）
2. Milvus 连接失败（readiness 503）
3. LLM 5xx（502/503 ExternalServiceError）
4. Rate Limit 触发（429）

---

## 简历亮点

[resume-bullets.md](./resume-bullets.md) —— 给 LLM Agent 工程师面试用的项目亮点段（直接抄 STAR 答案模板）。

**7 个亮点按 STAR + 量化**：

1. 单后端 py-api（商用 best practice 全落地）
2. 4 级水位线上下文压缩
3. LLM Gateway 双模型路由 + fallback
4. 多 Agent 编排（supervisor/planner/executor/replanner/reviewer/hitl）
5. 4 层记忆分层（Postgres/Redis/Qdrant/Milvus）
6. 真流式输出（SSE · asyncio.Queue）
7. 双层 fail-fast 商用部署

---

## CI 流水线

两个 workflow + 本地脚本：

| Pipeline | 文件 | 范围 |
|---------|------|------|
| CI (api · NestJS) | `.github/workflows/ci-api.yml` | lint-type-test + interface-e2e（9 接口）+ ci-summary |
| CI (py-api · Python) | `.github/workflows/ci-py-api.yml` | ruff + mypy + pytest + docker build + web-test + ci-summary |
| 本地 E2E | `scripts/ci-local-test.sh` | 9 接口端到端（act 替代品，5 秒跑完） |

**当前 badge**：

- ![CI api](https://github.com/zhangjizhe/interview-agent/actions/workflows/ci-api.yml/badge.svg)
- ![CI py-api](https://github.com/zhangjizhe/interview-agent/actions/workflows/ci-py-api.yml/badge.svg)

---

## 贡献指南

### 开发流程

1. Fork + 切分支（`fix/<name>` 或 `feat/<name>`）
2. 改代码 + 改对应测试
3. 本地跑：
   ```bash
   bash scripts/ci-local-test.sh  # 9 接口 E2E（5 秒）
   cd apps/api && npx jest --ci   # 203 用例
   cd apps/py-api && pytest       # 74 用例
   cd apps/web && pnpm exec vitest run  # 59 用例
   ```
4. 提 PR → 等 CI 绿 → 合并
5. 合并后等 GH Actions badge 变绿

### Bug 报告

提 Issue 时附：

- 复现步骤
- 期望 vs 实际
- 截图（用 [issue 模板](../../.github/ISSUE_TEMPLATE/bug_report.md)）
- docker logs interview-api 输出
- /api/health/ready 输出

### Feature Request

提 Issue 时附：

- 场景描述
- 期望功能
- 替代方案对比
- 实现成本估算

详见 [.github/ISSUE_TEMPLATE/](../../.github/ISSUE_TEMPLATE/)。

---

## 链接

- [GitHub Repo](https://github.com/zhangjizhe/interview-agent)
- [README](../../README.md)
- [Architecture](./architecture.md)
- [Runbook](./runbook.md)
- [Resume Bullets](./resume-bullets.md)
- [Architecture Decisions](./architecture-decisions.md)
- [Status Report 2026-06-20](./STATUS-REPORT-2026-06-20.md)
