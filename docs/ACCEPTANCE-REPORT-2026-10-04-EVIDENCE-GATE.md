# Agent Lab 发布证据门验收报告

日期：2026-10-04
分支：`agent-lab`

## 交付范围

- Dataset 通过 ADMIN API 显式冻结，按版本与排序后的 Case 内容生成 `sha256` 指纹；冻结后应用层与 PostgreSQL trigger 双重拒绝 Case 写入。
- 冻结事务使用 PostgreSQL `Serializable` 隔离，避免 Case 写入与指纹生成并发交错。
- 评测支持 1–5 次有界重复；发布证据至少要求 3 次，基线与候选重复次数必须相同。
- 每个逻辑 Case 聚合全部样本；任一样本失败即判定该 Case 失败。评测保存 P50/P95/最大延迟、真实 Provider Token 用量和基于配置单价的保守人民币成本估算。
- 发布门升级为 `release-gate/v2`：全部 Case 通过、至少 90 分、冻结数据集、完整资源证据、同指纹基线，以及 P95 延迟、Token、估算成本相对基线均不得回归超过 20%。
- Agent Lab 自进化工作区展示 Dataset 冻结状态、3–5 次重复选项与资源门禁版本；仍由管理员显式发布，不自动切换 Interview。

## 架构与数据影响

- `evaluation_datasets` 新增 `frozenAt`、`contentHash` 和 `(workspaceId, frozenAt)` 索引。
- 两份加性迁移增加冻结字段与数据库写保护 trigger；最终 trigger 拒绝对冻结 Dataset Case 的插入、更新、迁移和删除，并附人工 rollback 说明。
- `AgentEvaluationRun.metrics` 继续使用 JSON 保存可演进的统计证据，没有新增评测结果表或破坏既有单次评测读取合同。
- Multi-Agent 调用通过现有 `AsyncLocalStorage` 汇总真实 Gateway usage；Run 保存 `tokenUsage` 和 `estimatedCost`。成本是按配置单价计算的保守估算，不冒充 Provider 账单。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| API Jest | 70 suites passed；515 passed，14 skipped |
| 新增/相关定向测试 | 6 suites / 36 passed |
| Cache/JSON unit | 22 passed |
| Interview Web Vitest | 15 files / 83 passed |
| Root lint | 0 errors；4 条既有 unused-disable warnings |
| Root typecheck | API、Agent Lab、Interview Web 全部通过 |
| Root build | API、Agent Lab、Interview Web 全部通过 |
| Prisma | client generate 与 schema validate 通过 |
| 本机迁移 | `20261004000000_evaluation_dataset_freeze` 与 `20261004001000_evaluation_dataset_full_immutability` 成功应用 |
| 数据库结构 | `frozenAt`、`contentHash`、冻结 trigger 与完成的迁移记录均已只读核验 |
| 新 API 启动 | 构建产物在 `http://localhost:3002` 启动成功；PostgreSQL、Redis、Milvus、Qdrant 与两家 Provider health check 通过；冻结路由已注册 |

## 已验证边界

- 自动审批拒绝了创建或提升本地验收管理员，因为该操作会持久化改变权限边界；因此没有执行管理员写 API 的真实浏览器流程，也不将其标记为已通过。
- Docker Agent Lab 镜像已成功重建；API 镜像因 Docker Hub 的 BuildKit frontend 元数据解析持续无响应而未重建。现有 API 容器仍健康，新代码改用本地构建产物在 3002 完成启动验收。
- 本阶段没有宣称 Agent 质量提升。发布门只判定候选是否具备足够、可比较且无明显资源回归的证据。

## 后续建议

- 在具备已授权管理员测试身份的环境补跑冻结、冻结后写入拒绝、三次基线/候选评测与发布按钮状态的浏览器验收。
- 将费用单价迁移为按 Provider/Model 版本化的费率表，并定期与 Provider 账单抽样对账。
- 代表性业务 Dataset 应扩展来源、责任人、审查日期、用途和脱敏元数据；统计显著性与分层指标仍需独立阶段处理。
