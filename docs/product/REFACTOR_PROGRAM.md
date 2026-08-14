# 重构总纲与迁移程序

最后更新：2026-08-15
状态：TASK-010 设计完成；B0、B1 验收基线已通过。本文是后续实现的约束，不代表后续批次已经上线。

## 目标方向

产品方向保持为 AI Interview Training Platform，但运行方式从“会话驱动的面试控制台”收敛为
“证据驱动的自适应训练闭环”：

```text
岗位档案 + 简历版本
  -> 可比较的面试尝试
  -> 不可变评价运行与证据
  -> 版本化技能评估
  -> 一项可解释训练任务
  -> 训练完成记录
  -> 可比较的复面
```

用户看到的是问题、回答、评价、证据和下一步。Agent 的规划、工具、模型路由、检索和追踪保留在
受保护的运行/运维平面，不进入候选人合同。

## 保留与收敛

| 领域 | 决策 | 原因 |
| --- | --- | --- |
| React/Vite/TanStack Query | 保留 | 认证、候选人 Web Shell、测试与构建资产已存在。 |
| NestJS/Prisma/PostgreSQL | 保留并拆分模块边界 | 鉴权、资源归属、数据模型与 Docker 路径已在默认产品中运行。 |
| LangGraph/DeepAgents/LLM Gateway | 保留为 Agent Runtime Adapter | 已有 checkpoint、Gateway、降级、成本和 Trace 能力；不能再直接承担领域事实写入。 |
| Resume RAG/Question Bank/Knowledge | 保留并收敛接口 | 已有检索能力；面试选择只消费受控候选集和稳定题目元数据。 |
| EvaluationRun/AssessmentEvidence | 保留并完成生产链路 | 是可解释技能状态和训练推荐的唯一可信输入。 |
| AnswerHistory/Report | 兼容读取、渐进迁出写路径 | 历史面试不能被破坏；`Report` 继续是当前展示快照。 |
| `apps/py-api` 与 Agent 实验目录 | 只读研究，不作为默认运行时 | 未证明具备产品的鉴权、数据迁移、成本和验收能力。 |

## 目标模块边界

```text
Web
  -> API / Auth / Ownership
     -> Jobs
     -> Resume
     -> Interview Orchestration
     -> Evaluation
     -> Skills
     -> Training
     -> Usage and Quota
     -> Agent Runtime Adapter
        -> LangGraph / DeepAgents / Gateway / Tools / Retrieval
```

- **Interview Orchestration** 管理面试状态、稳定问题/回答 ID、候选人 SSE 白名单和幂等提交。
- **Evaluation** 只生成不可变 `EvaluationRun` 与 `AssessmentEvidence`，并在成功 `FINAL` 时事务性调用技能聚合。
- **Skills** 保存版本化技能状态及其来源运行，拒绝从自由文本报告或旧历史伪造状态。
- **Training** 从明确的技能缺口和证据创建单项训练任务；完成训练不等于提高分数，复面才产生新证据。
- **Agent Runtime Adapter** 只能建议问题、追问或候选内容。领域服务负责验证、持久化、权限与对外 SSE 映射。
- **Usage and Quota** 在 API/Gateway 边界执行，不依赖 Web 隐藏控件。

## 不变量

1. `FINAL` 评价成功前，不更新 `Report` 展示快照、`CandidateSkillState` 或准备度。
2. `PRACTICE`、`PREVIEW`、`FAILED` 和未批准 `DEGRADED` 运行不能污染正式技能状态。
3. 每个候选人只能读取自己的岗位、简历、面试、评价、证据、技能和训练数据。
4. 任一 `CandidateSkillState` 必须能沿来源运行回溯到同一用户、岗位、面试、问题和回答。
5. 候选人 SSE 仅含题目、进度、文本、可操作错误与完成状态；内部事件不得出现在浏览器响应。
6. 新模型、Prompt、规则或 Provider 只能在 Harness、成本门和发布审批通过后进入默认运行时。

## 数据迁移程序

当前开发库没有 `_prisma_migrations`，不能把 `db push` 的状态视为可部署事实。生产迁移按以下顺序执行：

1. **冻结与取证**：收集 schema/索引/FK 指纹、表行数、镜像摘要、检索库快照、Redis/Mem0/Langfuse
   副本清单；建立加密备份和可验证恢复演练。
2. **受控 Baseline**：从已恢复、已核验的实际应用 schema 生成单一 baseline migration。旧 migration
   仅作为审计历史；未跟踪或空 migration 目录必须先移除或补齐权威 SQL。
3. **专用 Migration Job**：由仅具 DDL 权限的 job 运行 `migrate deploy` 与 `migrate status`；
   API 运行时账户不拥有 DDL 权限。migration 失败必须阻止 API 就绪。
4. **可加性演进**：先只新增表、nullable 列、索引和约束。以影子写入、兼容读取、高水位标记和
   对账任务迁移，不重评旧回答、不伪造旧技能证据。
5. **切换与收缩**：连续一个发布窗口通过对账、恢复、隔离、成本与 Harness 门后才切换读路径。
   删除旧字段/数据必须在第二次恢复演练之后。

回滚通过关闭新读写、停止回填并回到兼容读路径实现；不对已写入的可加性数据做破坏性回滚。

## 分批路线与发布门

| 批次 | 单一主题 | 主要交付 | 必过验证 | 停止条件 |
| --- | --- | --- | --- | --- |
| B0 | 冻结基线与验收修复 | 可执行的 JWT E2E、SSE 候选事件合同、Harness 运行记录格式 | API/Web 构建、现有测试、更新后的真实登录浏览器路径 | 任何文档中的质量门不能在干净环境执行 |
| B1 | Production Migration Baseline | 备份/恢复脚本、schema 对账、baseline、migration job 与就绪门 | 隔离恢复演练、`migrate status`、迁移前后指纹、旧数据可读 | 备份不可恢复、schema 漂移、API 在 migration 失败后仍就绪 |
| B2 | 正式评价与技能状态 | `FINAL` 原子聚合、来源不变量、幂等和失败/降级隔离 | 临时 PG 合同测试、并发/重试、A/B 归属、Harness 非回归 | Report/Skill 被失败或非正式运行污染 |
| B3 | 岗位和准备度 | 单活跃岗位约束、岗位版本、透明准备度与隔离 | 并发写入、跨用户拒绝、无证据不出分 | 伪造分数或跨用户可见 |
| B4 | 选题与候选 SSE | Interview Mode、稳定选题元数据、候选事件白名单、断流幂等 | SSE 响应合同、成本归属、断流重试、浏览器流式路径 | 内部事件泄露或重复持久化 |
| B5 | 训练闭环 | TrainingRecommendation/Attempt、完成与复面关联 | 证据到推荐可追溯、训练不直接改分、复面比较 | 训练计划无证据或分数被手工修改 |
| B6 | 使用量与发布平面 | Usage Ledger、额度策略点、Harness 发布记录 | 服务端额度绕过测试、成本上限、可重放评测报告 | Web 可绕过额度或未验证 Agent 变更可发布 |

每批独立提交。下一批只有在前批的实现者证据、独立审查和验收负责人确认后开始。

### B0 验收记录（2026-08-15）

- JWT 真实登录脚本已改为候选人导航，并覆盖候选人创建目标岗位、用户访问管理员路由被重定向、管理员访问 MCP 页面及 390 x 844 登录页。
- API 在写入候选人 SSE 前使用白名单；Web 仅处理 `token`、`error` 和完成信号。Agent、工具、检索、模型与 `token_usage` 事件不会进入候选人合同。
- `pnpm --filter @interview-agent/api run eval:validate` 通过，验证 30 个 Golden Dataset Case 的结构；此检查不调用 Provider，也不构成质量发布门。
- 完整验证及限制记录在 `docs/ACCEPTANCE-REPORT-2026-08-15.md`。B1 仍被 Production Migration Baseline 的备份、恢复和 Schema 对账前置条件阻塞。

### B1 验收记录（2026-08-15）

- 旧 Prisma 迁移链已移至 `apps/api/prisma/migrations-legacy/` 作为审计材料；活动目录只保留一个由已恢复实际 PostgreSQL Schema 生成的 Baseline。
- Baseline 明确保留 Prisma datamodel 未表达的历史检查约束、唯一约束和 LangGraph checkpoint 表。后续 Schema 变化必须以新的加性 migration 处理，不得重新生成或改写 Baseline。
- 已完成源库到隔离恢复库的 Schema 指纹与 22 张表行数对账；空库 Baseline、checkpoint 初始化和 `migrate status` 均通过。
- Docker Compose 增加独立 migration job。API 启动时不再执行 `db push` 或忽略 DDL 失败，且 `/api/health/ready` 仅在 PostgreSQL、Redis 和 Baseline 均可用时返回 200。
- 本机开发库已在恢复验证后显式登记 Baseline。生产执行仍要求使用同一备份、恢复、指纹和双人发布程序。

## 团队交叉验收

| 责任 | 审核内容 |
| --- | --- |
| 数据负责人 | 备份/恢复、schema 指纹、对账、外键和并发约束。 |
| 安全负责人 | JWT/RBAC/ownership、跨用户拒绝、PII 副本与删除流程。 |
| Agent/Harness 负责人 | 数据集、质量/延迟/成本非回归、Provider 降级和发布记录。 |
| 后端负责人 | API 合同、事务、幂等、SSE、Migration Job 与回滚。 |
| Web/QA 负责人 | 桌面与移动主路径、错误恢复、候选人信息边界。 |
| 发布负责人 | 镜像摘要、环境配置、migration 状态、回滚开关与验收证据。 |

任一停止条件触发或任一责任未验收，批次不得晋级。

## Provider 与成本门

- Pull request 使用固定 mock/录制响应，不调用付费 Provider。
- 受保护验收环境先跑最多 12 条分层 canary；通过质量、结构化输出、超时和成本上限后，才运行完整
  Golden Dataset。
- 所有真实调用必须通过 LLM Gateway，以记录 Provider、fallback、Token、成本和 Trace。
- 固定模型版本、`temperature: 0`、最大调用数、超时、Token 与费用上限。质量下降、结构化输出失败、
  成本超限或安全回归立即停止。

## Agent 实验研究

`/Users/zhangjizhe/Desktop/agent-work/` 仅作为只读模式研究来源。研究结论必须说明来源文件、产品
适配成本和安全/成本/评测缺口；没有明确产品闭环与发布证据的实验实现不得进入默认运行时。

### 可采纳模式

推荐在 B5 之后增加受控的 `Evidence-Grounded Job Research -> Targeted Drill Loop`：

```text
TargetJob / JD
  -> 有界研究子图（仅授权知识与官方资料）
  -> 带来源、技能、有效期和期待证据的训练内容
  -> 定向训练与完成记录
  -> 同技能复测
  -> FINAL Evidence 聚合
  -> Skill State / Readiness 更新
```

这不是通用深度研究助手。每个研究产物必须属于一个 `TargetJob`、一个岗位技能要求和一个训练目标；
训练本身不能修改分数，只有可比较复面的新证据能改变技能状态。

可借鉴的模式：

- `agent-work/agent-exp/langgraphjs/.../retrieval-graph/graph.ts` 的显式分类、澄清、计划与研究状态机。
- `agent-work/agent-exp/langgraphjs/.../researcher-graph/graph.ts` 的每步骤查询计划和有界并行检索。
- `agent-work/agent-exp/langgraphjs/.../shared/state.ts` 的文档 UUID 去重 reducer。
- `agent-work/deepagents-test/.../summarization-agent.mjs` 的长上下文摘要阈值模式，复用现有
  `ContextManager` 而非其文件工作区。
- `agent-work/agent-exp/lobehub/.../agentEvalRun` 的评测快照、超时、重试、成本与状态概念；
  仅参考架构，不能复制 Community License 代码。

产品化前置：

- 每个研究步骤设置查询数、并发、来源数、文本量、Token、费用与超时上限。
- 所有模型调用经 LLM Gateway；研究输入、输出、来源和版本可追溯。
- MCP 仅允许管理员批准的只读工具，服务端强制身份、资源归属、参数校验、限流、超时和审计。
- 研究子图先以 mock/录制响应做合同测试，再通过分层 canary 与完整 Harness 门。

禁止直接迁移：

- 实验中的 Provider 直连、Elasticsearch/Mongo/Pinecone、Shell/文件系统、自动安装依赖和动态 stdio MCP。
- DeepAgents 文件工作区与候选人可编辑工具配置。
- 无来源的多模型“研究”生成，以及以 Notebook 或虚拟用户替代 Golden Dataset。
