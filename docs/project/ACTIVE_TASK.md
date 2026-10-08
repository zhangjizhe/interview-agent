# 当前任务

最后更新：2026-10-08

## 任务 ID

PROVIDER-HEALTH-PROBE-METERING-1

## 目标与范围

修复 API 启动时绕过 LLM Gateway、Quota 与 Usage Ledger 的真实 Provider 探针。保留依赖 readiness，并确保 Provider 请求只由业务 Gateway 调用；不运行新的付费模型请求或 Benchmark。

## 状态

已完成：移除 `LlmHealthBootstrap` 启动时的 Provider.chat 探针与未使用的 `healthCheckProviders()`；Gateway quota 保持 Provider 调用前置门。回归 16/16、API lint/typecheck/build、Docker build 和容器启动均通过。readiness 由 HTTP 503 修复为 HTTP 200；根因是本机未部署既有 migration `20261008010000_evaluation_cancellation`，独立 migration job 成功应用，无失败 migration。

既有结论仍有效：PR #4 已合入 main，Agent 1.0.0 正式版；1.0.1 DRAFT、发布门 REJECT。固定真实评测此前失败，13/36 成功样本、已核验小计 ¥0.069285、中断调用费用未知。续跑前核对额度与账单并明确新的有界预算。启动时不再主动验证模型供应商；后续如需独立 Provider 状态功能，应单独设计可计量、不产生意外付费推理的检查方式。修复详情见 `docs/ACCEPTANCE-REPORT-2026-10-08-PROVIDER-HEALTH-METERING.md`。

官方审计 0 critical / 1 high / 0 moderate；唯一 braces high 无上游修复，已用固定 SHA 补丁和实际 SDK 回归缓解。不是零漏洞或第三方审计。真实 Agent 1.0.0 保持发布；1.0.1 仍 DRAFT，发布门 REJECT。代码合并与候选发布分开验收。

## 验收

本次验收：`llm-gateway.fallback.spec.ts` 16/16；API lint/typecheck/build、Docker build 通过。修复容器健康、API readiness 200、Web/Lab 200，启动日志没有 Provider 探针。按 runbook 本机部署现有 17/17 migrations，新增应用一条加性 migration；无代码新增 migration、API 合同或依赖变化。未执行模型质量 Benchmark；没有新付费推理。
