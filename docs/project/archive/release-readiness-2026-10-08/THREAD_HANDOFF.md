> Historical context snapshot. Superseded by the current project context; past claims are not current verification.

# 任务交接

## 2026-10-08 · 认证与题库整合

认证/题库工程整合已通过 API 617、Web 95 与 lint/typecheck/build，详见 AUTH-GOVERNANCE 报告。接着可信 CI/文档和干净部署；旧报告/截图保留，不冒充真实模型质量。

## 2026-10-08 · 评测任务可靠性

RELEASE-READINESS-2 进行中。评测子阶段完成，报告见 ACCEPTANCE-REPORT-2026-10-08-EVALUATION-JOBS.md；接着认证/题库、CI/文档、干净部署与 main。无新增付费业务评测；不重置额度、自动发布或改写旧失败。旧未提交报告/截图保留。

## 2026-10-08 · INTERVIEW-CACHE-CONTEXT-1 交接

用户批准优化，当前阶段只改产品答案缓存；完整请求 SHA-256、认证组织/用户/面试、主路由与套餐限制已进入 Redis v2，旧数据/工具/截断/fallback 不复用。API 600（14 dedicated DB skipped）、Cache 22、Web 83、lint/typecheck/build 和真实 Redis 合成并发/TTL/流式核验通过；不新增业务 Provider 样本，Lab 仍 bypass，无候选发布。真实 canary 和质量对比仍需先核对额度及未知中断费用并确认新预算。原有题库/认证/UI/报告/上下文编辑保留且不混入本次提交。下一阶段从 COMPLETE_DELIVERY_PLAN 与 TASKS 选一个主题，当前工程阶段收尾后等待用户继续。

## 2026-10-08 · DELIVERY-UI-REFRESH-1 交接

用户要求完整项目与新设计风格。本阶段采用浅色专业工作台，两端样式、Interview 登录/导航、Lab 手机溢出及退出入口已验证；Web 83、lint/typecheck/build、最终 Docker 和 30/30 布局检查通过，真实 v4 REJECT/发布禁用仍成立。下一阶段按照 COMPLETE_DELIVERY_PLAN 完成普通 Interview 缓存隔离；受额度阻塞的真实对比另核验预算，不能自动发布。保留原有题库/认证/UI/旧报告编辑，后续独立整合；本机镜像含这些既有编辑，不能当成干净生产发布。

## 2026-10-08 · LAB-CURATED-BENCHMARK-6 核验收尾

已部署 Lab 内部 bypassSemanticCache 与 v4 发布门；API 545、Cache 22、Web 83、lint/typecheck/build 通过。固定 Dataset 已批准；首轮 36+36 缓存污染结果不采信。隔离基线 cmuyad4g9000xf0ua2vpw0u97 因月度额度 FAILED，13/36 成功样本、费用小计 0.069285 CNY；中断 Run cmuyale7n00bef0ua31b41x32 费用未知。候选未重跑、未发布，最终真实比较 REJECT/RG-021。不得重复提交、改写历史或自动放宽额度；先核对运营额度和中断费用，再确认新预算。报告已记录边界，普通 Interview 缓存隔离另列任务。原有编辑（含旧报告粘贴文本）保留。

## 2026-10-07 · LAB-CURATED-BENCHMARK-6 异常成本保护

本轮只修复发布评测的失败成本边界：运行异常和无效成本均停止后续 Provider 调用，FAILED metrics 记录 `costEvidenceStatus=unavailable`、`interruptedRunId` 和已核验费用小计。API 542 tests（14 skipped）、定向 18 tests、lint/typecheck/build 通过，API 镜像已重建启动且 readiness 正常。冻结 12 Case 仍 PENDING，运行总数 5，未执行批量 Provider 评测。等待用户明确批准固定数据集后继续，当前版本与草稿保持不变。原有未提交编辑继续保留。

## 2026-10-07 · LAB-CURATED-BENCHMARK-6（等待管理员审查）

已部署 `interview-release-v1@1.0.0`：12 个合成业务 Case、RAG/Evaluation/System Design 与三档难度均衡分层，不含候选人数据。管理员 `admin-acceptance` 已用于正常 RBAC 登录和幂等导入，未执行批准；Lab 当前展开 12 Case 审查视图。评测要求 `maxEstimatedCostCny`，服务端默认最多 5 CNY/版本，并在未知费率或达到阈值时停止后续调用。API 538 tests、Cache 22、lint/typecheck/build、Docker readiness 通过；评测总数仍为 5，未新增 Provider 调用。人类批准后再运行当前 1.0.0 与草稿 1.0.1 各 36 个样本，随后执行 v3 对比，禁止自动发布。

原有 UI/题库/Web/截图与旧交接编辑继续保留未提交；提交时只纳入本轮明确差异。

## 2026-10-07 · LAB-STRATIFIED-SIGNIFICANCE-5

已完成 `release-gate/v3`：3–5 次发布评测要求冻结 Dataset 至少 10 Case，Case metadata 包含 `jobFamily`、`skill`、`difficulty`；以 Case 为单位与同指纹基线配对，95% 区间下界不低于 -2 分，切片平均回归不超过 5 分。现有单 Case 失败探针在 UI/API 均被阻断，不应绕过。API 72 suites / 532 tests、Cache 22、lint/typecheck/build、Docker readiness 和浏览器展示通过；未运行批量真实评测。下一任务应先策划并人工审查真实脱敏业务 Dataset，再执行有界基线/候选评测。

原有 UI/题库/Web/截图与旧交接编辑继续保留未提交；提交时只纳入本轮明确差异。

## 2026-10-05 · LAB-PRICING-EVIDENCE-4

已建立 `2026-10-05.1` 版本化费率目录，Multi-Agent 与 Session Cost 按实际 Qwen/DeepSeek 模型计算成本；未知有计费 Token 的模型会令证据不可用。迁移 `20261005000000_versioned_llm_pricing` 已在本机应用，API:3001 与 Lab:5175 健康，Qwen/DeepSeek health check 正常。API 71 suites / 523 tests、Cache 22、lint/typecheck/build 通过。账单对账函数已测试，但无真实账单样本，不得写成财务对账通过。下一独立任务可补 Provider 账单抽样，或推进业务 Dataset 分层统计与显著性门禁。

原有 UI/题库/Web/截图与旧交接编辑继续保留未提交；提交时只纳入本轮明确差异。

## 2026-10-05 · LAB-EVIDENCE-GATE-3

已用既有管理员会话真实冻结 `Interview 失败探针 1.0.0`，生成指纹 `sha256:3e44457bff06fe37703f6ad349010bda00ad37247e8568cd4561fdd95a701607`，并完成冻结后的三次基线评测。发现冻结前可启动重复评测后，已在 API 和 Agent Lab 双层限制：3–5 次发布证据必须来自带指纹的冻结 Dataset。API Jest 516、Cache 22、lint/typecheck/build 通过。候选真实评测因浏览器自动审批服务容量不足未执行；不要将其记为通过或绕过审批。下一独立任务建议实现版本化 Provider/Model 费率表与账单抽样对账。

原有 UI/题库/Web/截图与旧交接编辑继续保留未提交；提交时只纳入本轮明确差异。

## 2026-10-04 · LAB-EVIDENCE-GATE-2

已完成 Dataset 冻结/指纹、Serializable 冻结事务与数据库 trigger、1–5 次重复评测聚合、Gateway usage 汇总、成本估算和 `release-gate/v2` 资源非回归门。迁移已应用本机；API 70 suites / 515 tests、Cache 22、Web 83、lint/typecheck/build 通过；本地新 API 3002 启动且 Provider health 正常。Docker Hub frontend 解析阻塞 API 镜像重建；管理员写验收因禁止持久化测试 ADMIN 未执行，均已写入验收报告。下一任务建议补管理员浏览器验收及版本化费率表，不自动发布、不声明质量提升。

## 2026-10-02 · 受控自进化首版交接（最新）

LAB-CONTROLLED-EVOLUTION-1 已完成。新增 ADMIN 自进化 API 与独立 Lab 工作区；草稿只在评测内部运行，发布门要求同 Dataset/Evaluator 基线、全部 Case 通过、至少 90/100 且不回归；显式发布后 Interview 才读取策略。真实验收保留 `Interview Agent 1.0.0` 为当前版本，创建的 `1.0.1` 失败探针草稿未发布。API:3001 与 Lab:5175 已重建运行，迁移无新增。继续前阅读验收报告；下一阶段应先补齐成本/延迟统计门，不能把单次规则评测当成质量改善。

原有 UI/题库注解/Web/截图与旧交接编辑仍保留未提交；提交时只纳入本轮明确差异。继续在 `agent-lab` 分支按迭代验证并推送。

## 2026-09-30 · Phase 3 交接（最新）

Phase 3 完成，等待用户继续下一独立阶段。API:3001、Interview:5173、Lab:5175、Grafana:3000、Prometheus:9090 已启动；监控端口仅 loopback。当前 API/migration 共享镜像并校验全部迁移，AuthSessionService 已导出。阅读本次验收报告、Runbook 与自主迭代日志；备份/本地秘密位于忽略目录，不输出或提交。原有 UI/题库注解/截图/旧交接改动仍保留未提交，运行前端含这些修改。继续 agent-lab 分支，逐迭代验证后推送。

## 2026-09-29 · Phase 2 交接（历史）

Phase 2 已完成，接续 Phase 3 需要用户明确继续。P2-1 提交 b9a1269 已推送；P2-2 验证完成后随本次提交推送。读取 docs/AUTONOMOUS-ITERATION-LOG.md、ADR 13/14 和 Runbook；真实数据库回归可运行 bash scripts/db/verify-phase2.sh。仅合成数据库应用迁移，未部署业务服务或调用 Provider。继续在 agent-lab 修改，每次交付验证后提交推送；原有 UI、题库 ADMIN 注解、截图与旧交接编辑保持未提交，不得混入。

## 2026-09-29 · Phase 1 交接（历史）

Phase 1 已完成并准备推送，等待用户继续；不要自动进入 Phase 2。进度权威见 docs/AUTONOMOUS-ITERATION-LOG.md。继续在 agent-lab 修改，每次迭代验证后提交推送。保留工作区原有 UI、题库 ADMIN 注解与旧交接文档改动；它们未混入本阶段提交。


最后更新：2026-09-03

## 上一任务

TASK-034：Agent Lab 认证与题库治理入口

## 已完成

- Agent Lab 注册成功与管理员授权状态分离；普通 USER 注册不再被误报为注册失败。
- 题库列表/搜索由后端 ADMIN-only 保护，并在 Agent Lab 提供列表、搜索、新增和删除工作区。
- Interview 全局认证请求收到 401 时清理失效会话并回到登录门，避免展示原始 `Invalid token`。

## 验证

- API/Web/Agent Lab typecheck/build 通过。
- Interview Web：14 files / 79 tests 通过。
- Docker：API、Interview Web 和 Agent Lab healthy。
- Browser：Agent Lab 认证/题库管理员与 USER 路径、Interview 失效 JWT 恢复和移动边界通过。
- Provider：未调用。

## 推荐下一任务

TASK-029：Agent Lab 离线评测调度合同

## 所需上下文

按 `AGENTS.md` 读取核心顺序，再阅读 `docs/agent-lab/CHARTER.md`、`docs/harness/RELEASE_GATE.md`、`apps/api/src/modules/agent-lab/`、Prisma Schema、操作日志合同和控制面浏览器验收。

## 风险

- 调度只能消费录制/mock 输入，不能触发真实 Provider 或绕过已有 Receipt、Experiment 和 Release Decision 边界。
- 调度的暂停、超时和并发控制必须可审计，且不得导致重复 Run 或自动发布。
- 2026-09-28 用户授权后已完成 TASK-030 代码整合；部署前仍需隔离数据库验证，参见下方同步记录。

## 2026-09-28 同步交接

- 合并提交：`b2ee67b`，包含远端 `526f59b`；工作区继续保留 TASK-034 的未提交修改与截图。
- 备份：`pre-origin-agent-lab-merge-2026-09-28` stash 未删除；已成功 apply，不应再次直接 apply。
- 新增迁移 `20260928000000_agent_lab_branch_integration` 尚未部署；历史远端迁移位于 `apps/api/prisma/migrations-archive/agent-lab-branch/`。
- 平台评价表已改名以避免覆盖候选人评价；独立控制面和原候选人路由保留，远端 Lab 页面暂未挂载。
- 合并代码测试：API 379、Web 83、typecheck/build、Schema 和 30-case Dataset 通过；数据库/浏览器/真实模型未验收。
- 后续继续 TASK-029 前应先决定是否单独安排整合部署验收；本次不声称线上或本地容器已更新。

- 分支约定（2026-09-28，用户指定）：后续修改统一在 `agent-lab` 进行，跟踪 `origin/agent-lab`。当前已将该远端分支快进至 `b2ee67b`；原有未提交修改保留在当前工作区。
