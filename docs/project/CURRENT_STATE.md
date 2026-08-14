# 当前状态

最后审计：2026-08-15
事实来源：仓库代码、Package Manifest、Prisma Schema 和 2026-08-12 验收证据。状态只描述已交付代码，不描述未来设计。

| 领域 | 状态 | 当前事实 |
| --- | --- | --- |
| 前端 | 已实现 | React/Vite 应用具有候选人训练首页、面试记录、岗位设置、面试房间、题库、工具和管理员 MCP 路由。候选人主导航只呈现训练闭环，不展示 Token、工具、MCP 或 Agent 内部信息。 |
| 面试流程 | 已实现 | 简历上传/解析、创建面试、确认简历、SSE 消息、HITL、结束和报告均存在。 |
| Agent Runtime | 已实现 | 默认 `multi` 是 LangGraph；DeepAgents 和 Direct LLM 是降级模式。 |
| Prompt Registry/Versioning | 部分实现 | Prompt 由源码管理；没有产品级 Registry 或实验 UI。 |
| Memory | 已实现 | Redis 短期记忆及 Mem0/Milvus 长期存储已存在。 |
| RAG 与题库 | 已实现 | Resume RAG、Dense Retrieval、BM25、RRF、Rerank、Milvus 题库、Qdrant 知识库、文件/URL 导入均存在。 |
| Evaluation/Reporting | 部分实现 | 单次报告、评分、AnswerHistory、ReflectionLog、Golden Dataset 和 Runner 存在；新面试可持久化 Question/Answer/Evidence/EvaluationRun，正式报告改为指向当前不可变运行的展示快照；成功 FINAL 运行会事务性聚合可追溯技能状态。 |
| Offline Harness | 部分实现 | Golden Dataset 和 Evaluation Runner 存在；版本对比和失败分析流程未完成。 |
| Observability/Cost | 部分实现 | Langfuse、会话 Token/Cost、Provider Health、Circuit Breaker、Semantic Cache 存在；生产 Metrics Plane 不完整。 |
| 数据库 | 已实现 | Prisma 覆盖用户、面试、消息、报告、成本、任务、答题历史、工具偏好和反思日志。 |
| 鉴权/安全 | 已实现 | Password Login、JWT Default-deny、USER/ADMIN RBAC、Ownership、URL Import SSRF 防护和校验均存在。 |
| Billing/Quota/Entitlement | 计划中 | 没有 Usage Ledger、Quota Enforcement、Plan Model 或 Payment Integration。 |
| Skill Map 与 Training Plan | 部分实现 | SkillDefinition、TargetJob、JobSkillRequirement、CandidateSkillState Schema 与受保护 API 已存在；目标岗位/JD、准备度 API 和 FINAL 技能状态聚合已实现，训练推荐、用户训练流程和真实趋势比较尚未完成。 |
| Mobile/小程序 | 计划中 | 当前 Web 有响应式；没有独立小程序客户端。 |
| 自动化测试 | 已实现 | API Jest/Unit Test、Web Vitest、Playwright/浏览器和 Content Workflow 验收资产已配置；B0 真实登录与岗位创建浏览器验收已可执行。 |
| 产品设计包 | 已实现 | 2026-08-13 已审计并建立 P0 产品、Agent、Harness 规格；未改变运行时行为。 |

## 已验证基线

最新记录的完整验收为 2026-08-12：

- API Jest：214 passed。
- Web Vitest：59 passed。
- API 与 Web typecheck/build：通过。
- 浏览器 RBAC 验收：9/9 passed。
- 真实 Provider Content Workflow：10/10 passed。

这是历史证据，不代表当前 Worktree 已重新验证。依赖具体范围前应阅读 `docs/ACCEPTANCE-REPORT-2026-08-12.md`。

## 重要约束

- 全局 API 前缀为 `/api`；改动路由时保留 Proxy 与浏览器验收覆盖。
- 用户归属的面试资源必须服务端校验，不能依赖 UI 隐藏。
- Multi-Agent Stream 依赖 `AsyncLocalStorage` 传递真实 interview ID，以持久化 Session Cost。
- Milvus Collection Indexed Schema 变更可能需要审慎 migration/rebuild。
- 模型调用消耗付费 Provider 容量，真实 Provider 验证必须有界且以证据为导向。

## 已知缺口

- 产品导航仍更接近面试控制台，而非训练平台。
- 评价输出尚未转换为持久化技能趋势或训练计划。
- Offline Agent Evaluation 缺少完整的实验/版本比较闭环。
- Metrics 和 Billing 基础仍是路线图工作。
- P0 产品规格要求先完成 P0-1 评估证据/技能合同，才能诚实实现准备度、技能、训练和对比 UI。
- 2026-08-13 已完成 P0-1 Schema、Migration、最终评估运行/展示快照边界和基础 API；本机 PostgreSQL 因没有 Prisma migration 基线触发 `P3005`，Migration 尚未执行，生产流尚未聚合 CandidateSkillState。
- 2026-08-14 已完成目标岗位、文本 JD 导入和准备度 API。准备度只在当前目标岗位具备简历、成功 FINAL 评价、岗位要求和正式技能状态时计算；否则返回显式缺失原因和 `overallScore: null`。
- 2026-08-14 已完成候选人训练平台前端壳：岗位设置、准备度首页、面试记录和评价失败恢复已使用真实 API 合同。Docker API 镜像已验证在 Nest 编译前生成 Prisma Client，本机开发数据库已按授权通过 `db push` 同步 Schema，目标岗位路由可用；认证后的创建路径仍需用可复现测试账户完成浏览器验收。
- 2026-08-15 已完成 B0 验收基线：候选人 SSE 仅接收文本、可操作错误和完成信号；内部 Agent、工具、检索、模型与 Token 成本事件均在 API/Web 双层过滤。真实浏览器验收覆盖随机用户登录、岗位创建、USER/ADMIN 隔离和移动端登录。
- 2026-08-15 已完成 B1 Prisma Migration Baseline：当前实际 PostgreSQL Schema（包括历史约束与 LangGraph checkpoint 表）已通过隔离恢复、Schema 指纹和 22 张表行数对账。活动迁移目录只保留单一 Baseline；Docker 独立 migration job 成功后 API 才启动，`/api/health/ready` 会检查 Baseline。生产仍须重复受控备份/恢复程序，不能将本机演练当作生产发布批准。
- 2026-08-15 已完成 B2 FINAL 技能状态聚合：`EvaluationService` 在成功 FINAL 运行的同一事务中写入 Evidence、运行快照、CandidateSkillState 和 Report；聚合只查询同一用户/岗位的成功 FINAL Evidence，非正式、失败和降级运行不改变技能状态。
- 2026-08-15 已完成 B3 岗位版本与准备度合同：TargetJob 有可递增 `profileVersion`，PostgreSQL 部分唯一索引保证每用户至多一个活跃岗位，准备度响应返回对应档案版本。
