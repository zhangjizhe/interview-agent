# 当前任务

最后更新：2026-10-08

## 任务 ID

REAL-PROVIDER-SMOKE-1

## 目标与范围

用户要求用真实 API 验证。本次范围是恢复本地运行依赖，并验证 API readiness 及启动时真实 Provider 连通性；不启动付费业务评测，不修改账本，不使用候选人数据。

## 状态

已完成：本机 PostgreSQL、Redis、Qdrant、Milvus/etcd 已恢复；API readiness、Interview 与 Lab 返回 HTTP 200；真实 Qwen/DeepSeek 启动探针成功。启动探针绕过网关计量，实际 token/费用未知；没有运行产品业务推理或 Benchmark。结果详见 `docs/ACCEPTANCE-REPORT-2026-10-08-REAL-PROVIDER-SMOKE.md`。

既有结论仍有效：PR #4 已合入 main，Agent 1.0.0 正式版；1.0.1 DRAFT、发布门 REJECT。固定真实评测此前失败，13/36 成功样本、已核验小计 ¥0.069285、中断调用费用未知。续跑前核对额度与账单并明确新的有界预算。新增后续任务 `PROVIDER-HEALTH-PROBE-METERING-1` 跟进启动探针绕过网关计量的问题。

官方审计 0 critical / 1 high / 0 moderate；唯一 braces high 无上游修复，已用固定 SHA 补丁和实际 SDK 回归缓解。不是零漏洞或第三方审计。真实 Agent 1.0.0 保持发布；1.0.1 仍 DRAFT，发布门 REJECT。代码合并与候选发布分开验收。

## 验收

本次验收：API readiness、Web 与 Lab HTTP 状态码为 200；脱敏启动日志的 Qwen、DeepSeek 探针均成功。无模型质量分数、usage 账本记录或供应商账单对账；实际费用未知。没有代码/API 合同变更、数据库 migration 或新增依赖。
