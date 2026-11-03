# 06 · Agent Lab 与评测

> 代码：`apps/api/src/modules/agent-lab/`（36 个文件，5 个控制器，路由前缀 `agent-lab`）
> 前端：`apps/agent-lab`（端口 5175）
> 章程：[docs/agent-lab/CHARTER.md](../agent-lab/CHARTER.md) · 能力边界：[docs/agent-lab-status.md](../agent-lab-status.md)

Agent Lab 不是"跑个评测脚本"，而是**一套版本治理 + 证据门 + 受控发布**的系统。它回答一个问题：**凭什么说这个 Agent 版本比上一个好，好到可以上线？**

## 1. 核心概念

| 概念 | 表 | 说明 |
| --- | --- | --- |
| Agent | `Agent` | 逻辑主体（如 `interview-interviewer`） |
| 版本 | `LabAgentVersion` / `AgentVersion` | **行为与模型身份都固化在这里**（`modelProvider` / `modelVersion` / `systemPrompt` / `modelConfig` / `runtimeConfig` / `toolBindings`） |
| 数据集 | `LabDataset` + `EvaluationCase` | 评测输入；有 `freeze` / `review` 动作 |
| 运行 | `LabRun` | 一次执行，带 tokens、`estimatedCostCny`、`metrics`、`traceSummary` |
| 失败 | `LabFailure` | 分类 + 严重度 |
| 实验 | `LabExperiment` / `LabExperimentRun` | A/B：`CONTROL` vs `TREATMENT` |
| 发布决定 | `LabReleaseDecision` | `APPROVE` / `NEEDS_REVIEW` / `REJECT` |
| 审计 | `LabOperationLog` | 谁在什么时候对哪个对象做了什么 |

## 2. 运行类型：录制与回放

```prisma
enum LabRunType { RECORDED  REPLAY }
enum LabRunStatus { PENDING  RUNNING  SUCCEEDED  FAILED }
```

- **RECORDED**：导入真实录制（`LabRecordedImport`：PENDING → IMPORTING → IMPORTED / FAILED），重放产生运行
- **REPLAY**：对数据集直接跑

关键区别在**证据强度**：录制回放能证明"当时是这样"，但不能证明"现在真实模型也会这样"。README 因此明确写：**录制 fixture 不是模型质量证据**，`APPROVE` 只记录人工决定。

## 3. 失败分类：15 个类别 + 4 级严重度

```prisma
enum LabFailureCategory {
  WRONG_QUESTION  BAD_FOLLOWUP  MISSING_EVIDENCE  HALLUCINATION
  CONTEXT_MISS    MEMORY_MISS   RAG_MISS          DIFFICULTY_MISMATCH
  REPETITIVE      OVER_SCORING  UNDER_SCORING     WRONG_SKILL
  STRUCTURED_OUTPUT  SAFETY     UNKNOWN
}
enum LabFailureSeverity { LOW  MEDIUM  HIGH  CRITICAL }
```

这套词汇的价值：**失败必须被归类，不能笼统说"效果不好"**。它同时是诊断工具（`CONTEXT_MISS` vs `MEMORY_MISS` vs `RAG_MISS` 分别指向不同子系统）和对齐工具（Reviewer 的 `issue_tags` 与它同源，见 [03](./03-agent-runtime.md)）。

## 4. 评测任务：三条反"造假"设计

评测任务（`evaluation-jobs.service.ts` + `EvaluationRun`）有几句实现上的硬约束，来自 README：

| 机制 | 作用 |
| --- | --- |
| **202 回执 + 幂等键** | 提交即返回任务号，重复提交不重复扣费 |
| **租约（lease）** | 同一任务不会被两个 worker 同时跑 |
| **真实进度** | 进度来自实际样本数，不是估算 |
| **失败费用小计** | 失败了也要如实记录已花的钱 |
| **崩溃不自动付费重放** | 进程死掉不会自动重来烧钱 |
| **未知费用不能记 0** | 状态是 `COST_UNKNOWN`，不是 `0` |
| **预算是样本边界软停止** | 到达 `AGENT_LAB_MAX_EVALUATION_COST_CNY` 就停在样本边界，不是硬杀 |

最后两条是这类系统最容易做错的地方：把"不知道花了多少"记成 0，会让后续所有成本结论失真。

## 5. 发布门（Release Gate）

```
候选版本 ──► 评测运行 ──► 证据汇总 ──► 发布决定
                                          ├─ APPROVE       （人工决定，仍受真实证据门约束）
                                          ├─ NEEDS_REVIEW  （证据不足）
                                          └─ REJECT        （证据表明变差）
```

`inference/release-gate-inference.ts`（313 行）是判定逻辑，`evaluation-statistics.ts` 提供统计口径（分层显著性等）。README 里那句「发布门 REJECT，费用按已核验小计展示，管理员发布禁用」就是这套系统的真实输出。

**两层分离，务必分清**：

1. **人工决定**（`LabReleaseDecision`）：人点 APPROVE/REJECT，记录的是"人的判断"
2. **真实发布证据门**：Agent 版本作用于 Interview 还需要真实模型在有界预算下的证据

只有第 2 层通过，版本才真正生效。

## 6. 受控进化（Controlled Evolution）

`controlled-evolution.service.ts` + `POST agent-lab/agents/:agentId/evolution/candidates`：

- 生成候选版本 → `GET .../candidates/:id/comparison` 对比
- 名称里的 "controlled" 是关键：**不允许系统自动把候选推上线**，必须有对比 + 决定

## 7. 路由地图

| 控制器 | 主要路由 |
| --- | --- |
| `agent-lab.controller.ts` | `dashboard`、`audit`、`operation-logs`、`retention/preview|execute`、`runs/record`、`recorded-imports*`、`experiments` |
| `agent-registry.controller.ts` | `bootstrap/interview-agent`、`configured-agents`、`agents` CRUD、`agents/:id/clone`、`agents/:id/versions` |
| `agent-runtime.controller.ts` | `runtime/models`、`agents/:id/test-runs`、`agents/:id/runs`、`runs/:id/cancel`、`runs`、`runs/:id/trace`、`runs/:id/trace.jsonl`、`runs/:id/trace.bundle` |
| `evaluation.controller.ts` | `datasets`（含 `bootstrap/interview-release-v1`）、`datasets/:id/cases`、`datasets/:id/freeze`、`datasets/:id/review`、`evaluators`、`agents/:id/evaluations` |
| `application.controller.ts` | `bootstrap/interview`、`:applicationId` |
| `controlled-evolution.controller.ts` | `candidates`、`candidates/:id/comparison` |

`runtime/models` 这个接口值得注意——它是前端能看到"当前有哪些模型可用"的入口，接 GPT 后要保证它返回新 provider（见 [08](./08-gpt-integration.md)）。

## 8. 安全边界（跑 Agent 代码的地方）

| 机制 | 文件 | 作用 |
| --- | --- | --- |
| `workspace-tool.guard.ts` | 工作区工具守卫 | 限制工具能碰的路径 |
| `command-policy.ts` + `command-executor.ts` | 命令策略 | 允许执行的二进制白名单（`WORKSPACE_ALLOWED_BINARIES`） |
| `tool-approval.service.ts` | 工具审批 | 危险调用需要人工授权（`ToolApproval`） |
| `runtime-adapter.registry.ts` + `plugin-registry.service.ts` | 可替换合同 | 运行时适配器注册，对接 [REPLACEABLE_AGENT_CONTRACTS.md](../architecture/REPLACEABLE_AGENT_CONTRACTS.md) |

这四层是"Agent 能执行代码"必须付的代价。改运行时（包括换模型后行为变化）要先确认这些守卫仍在生效。

## 9. 数据集现状（事实，不是目标）

| 数据集 | 规模 | 性质 |
| --- | --- | --- |
| 合成工程基准 | 30 Cases | `pnpm --filter api eval:validate` 校验格式 |
| 受控业务发布集 | 12 个已审查、冻结的合成场景 | 用于发布门对比 |
| 真实用户数据 | **无** | README 明确不填充虚构数据 |

以及一条重要的历史教训：**首轮基线与候选的 36+36 缓存污染结果不采信**。缓存污染会让两组跑出"看起来一样"的假象——做 A/B 时先确认缓存是否绕过（Lab 评测已强制绕过答案缓存）。

## 10. 改评测相关代码的红线

1. 不要让 `estimatedCostCny` 在未知时变成 `0`
2. 不要跳过幂等键（重复提交会重复扣费）
3. 不要在租约内并发跑同一任务
4. 不要用录制回放结果替代真实模型质量结论
5. 不要让缓存参与 Lab 评测（会污染对比）
6. 改模型/改 prompt 后必须出新版本，不能原地改（版本即证据）

---

[← 返回索引](./Home.md)　|　上一篇：[05 数据与存储](./05-data-and-storage.md)　|　下一篇：[07 · 开发与运维](./07-dev-and-ops.md)
