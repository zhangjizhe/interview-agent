# 业务分层与统计发布门验收报告

日期：2026-10-07

任务：`LAB-STRATIFIED-SIGNIFICANCE-5`

分支：`agent-lab`

## 交付结果

- 发布评测在任何 Agent/Provider 调用前检查冻结指纹、至少 10 个启用 Case、岗位族/技能/难度标签和切片覆盖，证据不足直接拒绝。
- 每次评测在既有 JSON `metrics` 中保存脱敏的 Case key、平均分、重复通过率和切片摘要；不新增数据库表，不复制原始输入或模型输出。
- `release-gate/v3` 要求候选与同指纹基线按 Case key 完整配对，并以 Case 为独立统计单位计算成对分差的双侧 95% Student t 区间。
- 区间下界低于 `-2` 分或任一业务切片平均回归超过 5 分时拒绝发布；原有 90 分、全部通过、重复次数和资源回归门继续生效。
- Agent Lab 增加岗位族、技能、难度标签输入，展示新门禁名称和统计下界；不足 10 Case 的冻结数据集不能启动发布评测。

## 验证证据

- 定向测试：5 suites / 40 tests passed。
- API Jest：72 suites passed、2 skipped；532 tests passed、14 skipped。
- Cache：22/22 passed。
- lint：0 errors，保留 4 条历史 warnings。
- 全仓 typecheck：passed。
- 全仓 build：passed。
- Docker：使用与仓库 Dockerfile 内容等价的临时本地 frontend 构建 API，migration exited 0，API healthy，readiness 的 PostgreSQL/Redis/migration 均为 `ok`；运行产物确认包含 `release-gate/v3`。
- Provider：仅执行启动健康检查，Qwen 与 DeepSeek 均为 OK；没有运行批量真实评测。
- 浏览器：Agent Lab 5175 显示业务切片、成对 95% 非劣效、三个标签输入；现有单 Case 冻结 Dataset 的基线/候选按钮均被禁用。

## 影响与边界

- 架构：复用 Evaluation Case metadata、Run metrics、Decision Ledger 和既有发布流程；没有新增服务或持久化表。
- API：端点不变，评测 metrics 与发布门 evidence 增加分层和统计字段。
- 数据库：无 schema 或 migration 变化；旧评测记录缺少 v3 证据，不能直接用于新发布。
- 安全：标签只接受最长 64 字符的小写 slug；统计证据不保存原始题目、回答、Prompt 或候选人信息。
- 成本：不合格 Dataset 在付费调用前失败；合格发布评测仍需至少 `10 × 3` 次 Agent 运行，应在管理员确认成本后执行。
- 效果：确定性测试证明门禁计算与拒绝路径，未使用真实业务 Dataset 证明 Agent 质量提升或统计显著改善。

## 未完成事项

- 当前已有冻结失败探针只有 1 个 Case，因此按 v3 正确阻断；需要新建至少 10 Case 的真实、脱敏、经人工审查业务 Dataset 才能生成可发布证据。
- 真实业务效果需要更大样本、预注册指标和独立实验；本次非劣效区间只用于工程发布保护。
