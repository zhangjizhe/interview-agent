# 开发入口

在修改本仓库前，所有开发者和 AI Coding Agent 必须完整阅读并遵守 [项目开发宪法](docs/PROJECT-CONSTITUTION.md)。

## Codex Context Protocol

Repository is the durable project memory. Chat history is not a source of truth.

Every new Codex task must load context in this order before scanning code:

1. `AGENTS.md`
2. `docs/PROJECT-CONSTITUTION.md`
3. `docs/project/PROJECT_CONTEXT.md`
4. `docs/project/CURRENT_STATE.md`
5. `docs/project/ACTIVE_TASK.md`
6. `docs/project/CONTEXT_INDEX.md`, then only the documents and code selected for the active task

Do not bulk-read the repository or historical archives without a task-specific reason. If a
context document conflicts with code, code is authoritative; update the relevant context document
as part of the task. Keep one active task only, record out-of-scope discoveries in
`docs/project/TASKS.md`, and use `docs/project/THREAD_HANDOFF.md` to transfer work between
threads.

At task completion, run relevant verification, inspect the diff, and update `CURRENT_STATE.md`,
`TASKS.md`, and `THREAD_HANDOFF.md`. Update `ARCHITECTURE_MAP.md`, `DECISIONS.md`, and
`CHANGELOG.md` when the task changes those facts. Keep current context concise; move obsolete
history to `docs/project/archive/` rather than growing the live context indefinitely.

执行规则：

1. 非简单改动先阅读现有实现、数据流、API、数据库、安全边界和成本影响，再提出最小可行方案。
2. 优先复用现有 NestJS、React、LangGraph、RAG、模型网关、鉴权、测试和验收能力；禁止无理由推倒重来。
3. 每个任务只处理一个明确主题。发现额外问题时记录 TODO，不擅自扩大范围。
4. AI 能力必须进入真实产品闭环，并经测试、验收或 Benchmark 验证后才能声明效果。
5. 禁止提交 API Key、密码、访问令牌、用户个人数据、本机绝对路径或未脱敏日志。
6. 重要改动必须说明架构、数据库、API、安全、成本和测试影响；重大架构决策需要 ADR。
7. 每次交付必须说明完成内容、验证结果、Benchmark/Evaluation（如适用）、未完成事项和后续建议。

当前默认产品路径为模块化单体：React + NestJS + Prisma + LangGraph + PostgreSQL + Redis + Milvus + Qdrant。`apps/py-api` 是实验性替代实现，不得作为默认产品路径修改的依据。
