# 业务回归集与真实评测治理验收报告

日期：2026-10-07

任务：`LAB-CURATED-BENCHMARK-6`

分支：`agent-lab`

## 本次可交付结果

- 新增版本化内置清单 `interview-release-v1@1.0.0`：12 个合成 Interview Agent 产品场景，不含候选人或生产会话数据。
- RAG、Agent Evaluation、System Design 各 4 Case；foundation、intermediate、advanced 各 4 Case，满足发布分层合同。
- 管理员可幂等导入固定 Dataset 与 Evaluator；Dataset 创建后立即冻结并生成内容指纹，重复导入不会新增副本。
- Agent Lab 可逐条展示输入、期望关键词、技能、难度和个人数据声明；管理员批准记录与冻结内容指纹分离。
- 未批准 Dataset、少于 10 Case、超过 50 Case、分层不完整或未声明成本停止阈值时，在 Provider 调用前拒绝发布评测。
- 服务端成本上限默认 5 CNY；客户端只能请求更低阈值。费率不可用或累计成本越过阈值时停止后续调用，并将运行标记为失败。

## 验证证据

- 定向测试：3 suites / 22 tests passed。
- API Jest：73 suites passed、2 skipped；538 tests passed、14 skipped。
- Cache：22 个 `node:test` Case 所在文件通过。
- lint：0 errors，保留 4 条历史 warnings。
- 全仓 typecheck、build：passed。
- Docker：migration exited 0；API healthy；readiness 的 PostgreSQL、Redis、migration 均为 `ok`；Agent Lab 5175 正常。
- 浏览器：使用现有管理员账号导入两次内置清单，始终只有 12 Case；逐条审查视图完整；审批前基线/候选评测按钮禁用。
- 数据库：`interview-release-v1` 已冻结，内容指纹为 `sha256:2b7afcec3f242506a3f12915630121fe5795903f18382ef842cae31be6bfc39a`，审查状态 `PENDING`，评测运行总数仍为 5。
- Provider：本阶段没有启动真实评测，因此没有新增付费调用，也不声明 Agent 质量变化。

## 架构、API、安全与成本影响

- 架构与数据库：复用现有 Dataset、Case、Evaluator 与 JSON metadata；无 Schema 或 migration 变化。
- API：新增内置清单幂等导入和 Dataset 批准端点；重复发布评测新增 `maxEstimatedCostCny` 合同。
- 安全：清单明确无候选人和个人数据；批准端点沿用 ADMIN RBAC；未绕过现有登录或发布门。
- 成本：12 Case × 3 次为每版本 36 个样本，基线/候选共 72 个样本。默认每个版本到 5 CNY 停止后续调用；一个已在途样本可能令最终值略超阈值。

## 尚待人类完成

- 当前管理员需要在 Agent Lab 展开的 12 Case 清单中逐条核对，并明确批准或要求修改。自动化代理不能代替这项人类数据审查。
- 只有批准后才执行真实基线与候选评测。即使 `release-gate/v3` 推荐通过，也不自动发布候选版本。
