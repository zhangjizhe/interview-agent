# 固定回归集真实评测与缓存隔离交付报告

日期：2026-10-07 实测；2026-10-08 核验收尾，任务：`LAB-CURATED-BENCHMARK-6`，分支：`agent-lab`

状态：缓存隔离修复通过工程验收；正式真实评测因月度额度拒绝而失败，未达到业务交付验收，候选未发布。

## 授权与评测合同

用户在明确的数据集批准、36 样本/版本和 5 CNY/版本计划后确认继续。通过现有 ADMIN 登录与审查 API 批准 `interview-release-v1@1.0.0`；未修改角色或绕过权限。

固定 Dataset 为 12 个合成场景，不含候选人数据；RAG、Agent Evaluation、System Design 各 4 Case，三档难度各 4 Case。固定 Evaluator 为 `interview-release-keywords/v1`，仅验证指定术语遵循，不能代表问题深度、追问、评分准确性、RAG 召回或完整面试质量。

指纹：`sha256:2b7afcec3f242506a3f12915630121fe5795903f18382ef842cae31be6bfc39a`。

## 实测发现与修复

首轮基线与草稿各运行 36 个样本，术语评分均为 100。但基线 24 个运行为零 Token，候选所有运行为零 Token；检查发现语义缓存只按用户消息复用，没有区分 Agent 策略。因此首轮 v3 APPROVE 不采信。

Lab 评测现在通过服务端内部选项与 AsyncLocalStorage 强制绕过答案语义缓存读写，兼容同步与流式模型调用；并发普通 Interview 请求保持现有缓存策略。Provider Prompt 输入缓存继续保留，它仍生成本次答案并返回真实 usage。

发布门升级为 `release-gate/v4`，要求基线与候选均记录 `cachePolicy: semantic-cache-bypass/v1`。部署后实际查询首轮比较为 `REJECT`，规则 `RG-021:answer-cache-isolation-required`。旧运行保持原始事实，不删除或改写。

首轮已核验估算费用 ¥0.009238；正式重跑每版本收紧为 ¥4.99 停止阈值，保持本次原授权预算约束。

## 工程验证

- 先验证缓存绕过与旧证据拒绝的回归测试失败，再实现修复。
- API：73 suites / 545 tests passed，2 suites / 14 tests skipped。
- Cache：22 passed；Interview Web：15 files / 83 tests passed。
- lint：0 errors、4 条既有 warnings；全工作区 typecheck/build 通过。
- 官方 API Dockerfile 构建成功，既有 migration job 完成，API healthy/readiness 正常。
- 真实重跑 13 个成功样本未命中语义答案缓存；第 14 个 Run FAILED，缺少 Token/费用证据。成本保护停止后续调用，未执行候选重跑。

## 影响与边界

- 代码：Gateway adapter、MultiAgent、AgentRuntime、EvaluationService、发布门及对应测试。
- 架构：复用既有 ALS 与模型网关，无新依赖、数据库表或 migration。
- API/UI：无新路由或客户端开关，评测 metrics 增加缓存策略证据。
- 安全：保留 ADMIN、Workspace、组织、额度与成本门禁；未使用候选人数据。
- 成本：真实运行较缓存命中更慢、更贵；估算不是 Provider 账单，预算仍是软停止阈值。
- 未自动发布，Interview 当前版本仍为 1.0.0。
- 后续必须独立治理普通 Interview 语义缓存的策略/完整上下文指纹；本轮只保证 Lab 评测隔离，不能宣称整个产品缓存问题已解决。

## 正式结果

| 运行 | 状态 | 样本/缓存证据 | 费用与结论 |
| --- | --- | --- | --- |
| 首轮基线 1.0.0 | COMPLETED，证据不采信 | 36 样本，24 个零 Token；缓存路径参与 | ¥0.009238，不能用于可信版本比较 |
| 首轮候选 1.0.1 | COMPLETED，证据不采信 | 36 样本，全为零 Token、答案缓存返回 | ¥0，不能证明候选质量或性能 |
| 隔离后基线 1.0.0 | FAILED | 13/36 成功样本，4 个完整 Case；未命中答案缓存 | 已核验小计 ¥0.069285；中断样本费用不可用，不能当作完整账单 |
| 隔离后候选 1.0.1 | 未启动 | 0/36 | 无正式候选比较证据 |

基线评测 `cmuyad4g9000xf0ua2vpw0u97` 于 2026-10-07 15:52:18 UTC 开始、15:58:53 UTC 失败。中断 Run `cmuyale7n00bef0ua31b41x32` 返回既有月度额度拒绝；Token 和成本为空。FAILED metrics 保留 `budget.status=stopped`、`completedSamples=13`、`spentCny=0.069285`、`costEvidenceStatus=unavailable` 和中断 Run 引用。客户端连接中断不代表服务端取消，已只读核对服务端终态，未重复提交。

最终真实 comparison API 返回 `release-gate/v4` / `REJECT` / `RG-021:answer-cache-isolation-required`。没有合格的新基线与候选，不能计算正式配对置信区间，不能声明非回归、质量提升或发布就绪。当前版本仍为 1.0.0，草稿仍为 1.0.1。

## 未完成与后续

正式 36+36 样本评测未完成。管理员应先检查组织套餐及本月模型尝试用量，确认运营额度；未知中断费用需核验后再给出新的有界重跑预算。不能重置用量、绕过额度、自动升级套餐或盲目重试。普通 Interview 缓存完整上下文/策略/模型指纹治理仍是独立发布前事项。

本轮交付仅覆盖缓存隔离代码、v4 发布门、工程验证和失败审计证据；完整可商用业务版本尚未通过真实验收。
