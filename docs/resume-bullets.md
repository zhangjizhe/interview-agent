# 简历项目亮点 · 当前 NestJS / AgentLab 路径

口径更新：2026-09-28。旧稿描述过 Python 单后端实验与 `api-legacy`，不再作为当前主线能力。开发时间线需本人确认，不依据提交日期补写经历。当前验证统一引用 [测试基线](TESTING.md)，不沿用旧稿 336 的跨分支合计。

项目：https://github.com/zhangjizhe/interview-agent （平台开发见 `agent-lab` 分支）

## 可用于简历的项目描述

面向技术招聘构建 AI 面试平台，采用 NestJS、React、LangGraph、PostgreSQL、Redis 和 Milvus，将简历解析、检索出题、流式追问与评估报告串成可验证业务流程；在此基础上实现 AgentLab 的版本化注册、运行追踪和确定性评测。

- **可追溯执行**：通过 LangGraph 多节点、checkpoint、任务队列与 AnswerHistory 保存执行上下文和回答证据；AgentLab 追加式 TraceEvent 关联运行、工具与审批。代码：`apps/api/src/agents/multi-agent/`、`apps/api/src/modules/agent-lab/trace-event.service.ts`。
- **混合检索**：组合 Milvus dense、BM25、RRF 与 rerank，导入时 flush 处理写后可见；用真实内容工作流验收检索和输入校验。代码：`apps/api/src/modules/knowledge-base/`；证据：`docs/ACCEPTANCE-REPORT-2026-08-12.md`。
- **模型网关**：实现 Qwen / DeepSeek 路由、健康检查、永久错误熔断与会话成本统计。没有将 fallback 表述为请求级退避，也不声明未经测量的 99% 可用性。代码：`apps/api/src/modules/llm/`。
- **平台评测**：围绕 AgentVersion / Application / Run / TraceEvent / Evaluation 建立契约，使用 KEYWORD、JSON_SCHEMA、LATENCY 确定性规则关联实际运行。代码：`apps/api/src/modules/agent-lab/evaluation.service.ts`。
- **安全与交付**：实现 scrypt、JWT、RBAC、归属校验、限流与版本化数据库迁移；通过本地测试和构建验证。代码：`apps/api/src/modules/auth/`、`apps/api/prisma/`。

## 面试追问准备

**测试覆盖率是多少？**

当前有后端模块单测、缓存/JSON 工具测试、前端组件/状态/流式 hook 与 AgentLab 页面测试；用例数见 TESTING.md。没有新的覆盖率报告就不报百分比。历史 Docker / 浏览器 / Provider 验收有独立日期；剩余被排除的旧 spec 也公开列出，不能把默认测试通过解释为全链路无缺陷。

**缓存节省多少成本？**

不把缓存命中计数当作收益。2026-08-12 对照中直接 Qwen 为 15,402 tokens，多 Agent 为 20,024 tokens（+30.01%），尽管有 46 次语义缓存命中记录。优化方向是每轮节点调用预算、命中后短路和逐节点归因。历史 prompt cache 与 semantic cache 的 0% 原因不同，见 Roadmap。

**Python 后端和 NestJS 是什么关系？**

NestJS 是当前默认产品路径；Python 保留为实验实现，不把 Python 的 tenacity、Prometheus 等能力自动算作 NestJS 的已交付功能。

**工具执行是否安全隔离？**

当前有审批、预算、路径边界和审计，尚不是 OS 级沙箱；远程 worker 与调度器待完成，不能对不受信任任意命令作隔离承诺。
