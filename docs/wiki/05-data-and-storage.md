# 05 · 数据与存储

> Schema：`apps/api/prisma/schema.prisma` · **53 个 model · 33 个 enum**
> 迁移：独立 `migration` 服务执行，成功后 `api` 才启动

## 1. 存储分工

| 存储 | 存什么 | 关键约束 |
| --- | --- | --- |
| **PostgreSQL**（Prisma） | 全部业务实体、证据、账本 | 单库多表，租户字段隔离 |
| **Redis** | 会话态、额度预留、精确答案缓存 | `REDIS_SESSION_TTL`；额度必须先预留再调用 |
| **Qdrant** | 向量检索（主） | `QDRANT_URL` |
| **Milvus** | 向量检索（历史/兼容，依赖 etcd+minio） | `MILVUS_URL`；遗留类型错误 3 个，不在当前范围 |
| **Mem0** | 抽取出的用户长期事实 | `MEM0_API_KEY / HOST / ORG_ID / PROJECT_ID` |
| **Langfuse** | LLM trace / generation | 采样率三项：trace / span / generation |
| **Prometheus/Grafana** | 运行指标与看板 | `METRICS_TOKEN` 保护 `/api/metrics` |

## 2. 53 个模型的分组

### 2.1 租户与身份（5）

`Plan` · `Organization` · `User` · `Workspace` · `WorkspaceMember`

多租户的落地方式（几乎每个业务表都重复这个模式）：

```prisma
model LabRun {
  organizationId String @default("default-organization")
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  @@index([organizationId])
  @@unique([id, organizationId])
  @@map("lab_runs")
}
```

三个细节：**`onDelete: Restrict`**（禁止级联删除租户数据）、**复合唯一 `[id, organizationId]`**（防跨租户 ID 碰撞）、**`@@map` 蛇形表名**。

### 2.2 面试业务（11）

`Interview` · `Message` · `Report` · `InterviewTask` · `InterviewQuestionPresentation` · `AnswerHistory` · `InterviewQuestion` · `InterviewAnswer` · `EvaluationDefinition` · `EvaluationRun` · `AssessmentEvidence`

核心链路：`Interview` → `Message` → `InterviewQuestionPresentation` → `AnswerHistory` → `Report`。

**`InterviewQuestionPresentation` 是这一组的关键表**：它固化"这一轮给候选人看的是哪个问题的哪一版"，回答必须绑定到它。近期提交 `bind answers to persisted question presentations` / `persist question presentation and fenced answer claims` 都在强化这条不变式。

### 2.3 岗位与技能（6）

`TargetJob` · `SkillDefinition` · `JobSkillRequirement` · `CandidateSkillState` · `TrainingRecommendation` · `TrainingAttempt`

`TargetJob` → `JobSkillRequirement`（岗位要求） ↘
`CandidateSkillState`（候选人当前水平） → `TrainingRecommendation` → `TrainingAttempt`（训练闭环）

### 2.4 题库目录（3）

`QuestionCatalogState` · `QuestionCatalogEntry` · `QuestionCatalogVersion`

对应「canonical catalog 与 retrieval index 分离」：**目录有版本**（`QuestionCatalogVersion`），索引是可重建的派生数据。

### 2.5 Agent Lab 治理（9）

`LabDataset` · `LabAgentVersion` · `LabRun` · `LabRecordedImport` · `LabFailure` · `LabExperiment` · `LabExperimentRun` · `LabReleaseDecision` · `LabOperationLog`

`LabAgentVersion` 里有两组字段值得记住：

```prisma
modelProvider      String?     // ← 模型身份记在版本上
modelVersion       String?
```

选 `String?` 而不是 enum，意味着**新模型不需要改 schema**——这对接 GPT 是利好，但代价是没有编译期约束（写错 provider 名不会报错）。

### 2.6 Agent 运行与证据（8）

`Agent` · `AgentVersion` · `Run` · `TraceEvent` · `DecisionRecord` · `FactAssertion` · `DecisionEvidence` · `ReflectionLog`

证据链的结构：`Run`（一次执行）→ `TraceEvent`（过程）→ `DecisionRecord`（判定）→ `FactAssertion`（事实断言）→ `DecisionEvidence`（证据指针）。`ReflectionLog` 存 ADR #10 的反思与 issue tag。

### 2.7 评测（5）

`EvaluationDataset` · `EvaluationCase` · `Evaluator` · `AgentEvaluationRun` · `EvaluationResult`

### 2.8 其他（6）

`Application` / `ApplicationRun`（投递上下文）· `ToolApproval` / `UserToolPreference`（工具授权与偏好）· `SessionCost` / `UsageLedger`（成本与用量账本）

## 3. 三张"钱"相关的表

| 表 | 粒度 | 用途 |
| --- | --- | --- |
| `SessionCost` | 会话 | 一次面试的总花费与明细，前端 cost panel 读它 |
| `UsageLedger` | 每次预留/结算 | 额度账本，防超支、可对账 |
| `LabRun.estimatedCostCny` + `inputTokens`/`outputTokens` | 每次 Lab 运行 | 评测成本证据，预算软停止的依据 |

注意 `LabRun` 有 token 与费用，但**没有 provider/model 字段**（模型身份只在 `LabAgentVersion` 上）。这意味着同一版本内如果换了模型，run 层无法区分。接 GPT 做 A/B 评测时这是个真问题，见 [08 §6](./08-gpt-integration.md)。

## 4. 迁移与备份

```bash
pnpm db:generate      # prisma generate
pnpm db:migrate       # 开发迁移
pnpm db:deploy        # 生产部署迁移（compose 的 migration 服务用）
pnpm db:studio        # 可视化
bash scripts/db/verify-phase2.sh    # 新库 + 旧库升级 + 租户/额度/评测任务验证（17 项）
```

规则（README 明确要求）：

1. 已有数据库升级前**先备份**，并在**隔离环境验证恢复**；
2. 隔离恢复成功**不等于**生产恢复证明；
3. 迁移由独立服务执行，`api` 启动前完成；readiness 会校验所需迁移是否就位。

## 5. 改数据层时的检查清单

- [ ] 新表是否带 `organizationId` + `@@index([organizationId])` + `@@unique([id, organizationId])` + `@@map(...)`？
- [ ] 关系是否用 `onDelete: Restrict`（避免误删租户数据）？
- [ ] 是否需要在 `UsageLedger`/`SessionCost` 留下成本痕迹（涉及模型调用）？
- [ ] 是否影响 `LabRun` / 证据链的可追溯性（涉及评测结论）？
- [ ] 旧数据兼容：新字段是否 nullable 或有默认值？旧 checkpoint 反序列化会不会炸？
- [ ] 是否更新 `scripts/db/verify-phase2.sh`（新增业务表要加行数校验）？

## 6. 向量库的两个现实问题

1. **双库并存**：Qdrant 是主，Milvus 是历史/兼容。`TASKS.md` 里有「历史 16 题复用：组织/embedding 来源确认 → 保留源迁入/持久收据/读回/浏览器，禁止跨租户 fallback」——说明**迁移未完全收口**，动检索逻辑时别假设只有 Qdrant。
2. **embedding 维度是硬约束**：`quota`/网关侧强制 1024 维（`text-embedding-v3`）。换成 OpenAI 的 1536 维 embedding 会让存量题库存量全部失效——这是接 GPT 时**唯一不建议动**的部分，详见 [08](./08-gpt-integration.md)。

---

[← 返回索引](./Home.md)　|　上一篇：[04 LLM 网关](./04-llm-gateway.md)　|　下一篇：[06 · Agent Lab 与评测](./06-agent-lab.md)
