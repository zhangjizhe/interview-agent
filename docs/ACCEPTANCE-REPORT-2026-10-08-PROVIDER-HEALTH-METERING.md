# Provider 启动探针计费边界修复报告

日期：2026-10-08；分支：`agent-lab`；任务：`PROVIDER-HEALTH-PROBE-METERING-1`

状态：工程修复通过；没有发起新的模型推理。

## 变更

- 移除 `LlmHealthBootstrap` 启动钩子，避免 API 每次启动都向 Qwen、DeepSeek 各发送一个可能计费的聊天请求。
- 移除未使用的 `LlmGatewayService.healthCheckProviders()` 直连方法。Provider 请求只在业务请求通过 Gateway 额度预留后发出；原有鉴权/计费错误禁用和 fallback 逻辑保留。
- `/api/health/ready` 继续验证 PostgreSQL、Redis 和 Prisma migration，不把模型推理混入基础设施 readiness。

## 影响

- 架构：不新增模块；移除一个绕过统一 Gateway 的启动调用路径。
- 数据库：代码没有新增或修改 migration。为使当前本机 API readiness 对齐仓库版本，按 runbook 使用独立 migration job 部署了已提交的加性 migration `20261008010000_evaluation_cancellation`，增加 `CANCELLED` 枚举值和可空 `cancelRequestedAt` 列；17/17 migration 成功。没有重置或删除数据。
- API/UI：没有 API 合同或 UI 变化。
- 安全/成本：启动不再产生未经额度预留、无用户请求上下文的模型调用。首次业务调用仍通过 Gateway；本次未验证 Provider 业务响应、模型质量或账单。

## 验证

- 回归：`llm-gateway.fallback.spec.ts` 16/16 通过，覆盖 Provider 调用先于其发生的 Gateway quota reservation 约束。
- API lint、typecheck、Nest build 均通过；Docker API 镜像重建成功。
- 修复镜像重启后：容器 `healthy`、`/api/health/ready` HTTP 200、Interview/Lab HTTP 200；脱敏启动日志无 Provider health probe 或 chat 调用事件。
- 无模型质量 Evaluation 或 Benchmark；本次无付费模型请求。

## 边界与后续

启动时不再主动验证供应商网络或凭据，Provider 可用性在首个业务请求中通过 Gateway 正常处理。若后续需要独立 Provider 状态页，应使用可证明不产生计费推理的供应商能力或受控、可计量的管理操作，并补充授权、成本、超时和回归合同。

此前 36 样本真实评测仍因额度失败，13/36 样本成功，已核验费用小计 ¥0.069285，中断调用费用未知。续跑前仍需核对供应商额度/账单并给出新费用上限。
