# 当前状态

最后审计：2026-08-20
事实来源：仓库代码、Package Manifest、Prisma Schema 和 2026-08-12 验收证据。状态只描述已交付代码，不描述未来设计。

| 领域 | 状态 | 当前事实 |
| --- | --- | --- |
| 前端 | 已实现 | Interview 候选人应用采用工作台导航，具有首页、面试记录、训练、岗位设置和面试房间；Agent Lab 是独立管理员控制台。候选人主导航不展示 Token、MCP、模型或 Agent 内部信息。 |
| 面试流程 | 已实现 | 简历上传/解析、创建面试、确认简历、SSE 消息、HITL、结束和报告均存在。 |
| Agent Runtime | 已实现 | 默认 `multi` 是 LangGraph；DeepAgents 和 Direct LLM 是降级模式。 |
| Prompt Registry/Versioning | 部分实现 | Prompt 由源码管理；没有产品级 Registry 或实验 UI。 |
| Memory | 已实现 | Redis 短期记忆及 Mem0/Milvus 长期存储已存在。 |
| RAG 与题库 | 已实现 | Resume RAG、Dense Retrieval、BM25、RRF、Rerank、Milvus 题库、Qdrant 知识库、文件/URL 导入均存在。 |
| Evaluation/Reporting | 部分实现 | 单次报告、评分、AnswerHistory、ReflectionLog、Golden Dataset 和 Runner 存在；新面试可持久化 Question/Answer/Evidence/EvaluationRun，正式报告改为指向当前不可变运行的展示快照；成功 FINAL 运行会事务性聚合可追溯技能状态。 |
| Offline Harness | 部分实现 | Golden Dataset 和 Evaluation Runner 存在；版本对比和失败分析流程未完成。 |
| Observability/Cost | 部分实现 | Langfuse、会话 Token/Cost、Provider Health、Circuit Breaker、Semantic Cache、最小 Usage Ledger 和服务端面试次数额度存在；生产 Metrics/Entitlement 平面不完整。 |
| 数据库 | 已实现 | Prisma 覆盖用户、面试、消息、报告、成本、任务、答题历史、工具偏好和反思日志。 |
| 鉴权/安全 | 已实现 | Password Login、JWT Default-deny、USER/ADMIN RBAC、Ownership、URL Import SSRF 防护和校验均存在。 |
| Billing/Quota/Entitlement | 部分实现 | Usage Ledger、配置化月面试次数额度和候选人使用量摘要已实现；Plan、Entitlement、Payment 和团队计费仍未实现。 |
| Skill Map 与 Training Plan | 部分实现 | SkillDefinition、TargetJob、JobSkillRequirement、CandidateSkillState Schema 与受保护 API 已存在；目标岗位/JD、准备度 API 和 FINAL 技能状态聚合已实现，训练推荐、用户训练流程和真实趋势比较尚未完成。 |
| Mobile/小程序 | 计划中 | 当前 Web 有响应式；没有独立小程序客户端。 |
| 自动化测试 | 已实现 | API Jest/Unit Test、Web Vitest、Playwright/浏览器和 Content Workflow 验收资产已配置；B0 真实登录与岗位创建浏览器验收已可执行。 |
| 产品设计包 | 已实现 | 2026-08-13 已审计并建立 P0 产品、Agent、Harness 规格；未改变运行时行为。 |
| Agent Lab 控制面 | 已实现 | 独立 `apps/agent-lab` 管理员控制台已提供 MCP 服务查看、启停、健康检查和配置重载；Interview 仍保留领域事实与 NestJS 运行时。 |

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
- 2026-08-15 已完成 B3 岗位版本与准备度合同：TargetJob 有可递增 `profileVersion`，PostgreSQL 部分唯一索引保证每用户至多一个活跃岗位，准备度响应返回对应档案版本；Docker 真实 JWT 浏览器验收覆盖创建、读取、编辑、激活、无证据准备度和跨用户拒绝，19/19 通过。
- 2026-08-15 已完成 B4 面试模式与候选人 SSE 合同：Interview 持久化完整模拟/单技能练习、岗位档案版本快照和所选技能；题目保存稳定技能、追问目的与选择元数据。客户端重试复用消息 ID，完成的请求只重放已保存回复，不重复写回答或进入 Agent 成本路径；当前仍未提供 Event ID/Offset 逐 token 续传。加性 migration、API 27 suites / 249 tests、Web 75 tests、Docker 和真实浏览器验收 21/21 通过。
- 2026-08-17 已完成 B5 单技能训练推荐与复测关联：TrainingRecommendation 只由活跃岗位中成功 FINAL 运行的低分正式技能状态生成，绑定岗位档案版本、来源运行和 Evidence；TrainingAttempt 记录完成与复测 Interview。训练完成不改变 CandidateSkillState。加性 migration、API 29 suites / 256 tests、Web 76 tests、Docker 和真实浏览器验收 22/22 通过。
- 2026-08-20 已完成 Interview V0.2 候选人无 Provider 主流程验收：注册、岗位、版本化准备度、完整/单技能面试选择、训练空态、跨用户拒绝和移动工作台均经过 Docker 浏览器 23/23 验证。真实 Provider 评价质量仍需独立 Harness canary。
- 2026-08-26 已完成 B6 最小 Usage Ledger 和服务端面试额度：按用户/自然月/面试创建幂等记录，候选人仅读取安全摘要；Docker 主路径在上限 1 时验证 `0/1 -> 1/0 -> 429`，验收后恢复默认未配置额度状态。
