# 真实 Provider API 连通性冒烟报告

日期：2026-10-08；分支：`agent-lab`；任务：`REAL-PROVIDER-SMOKE-1`

状态：本机 API 和两家模型 Provider 连通性通过；不构成产品面试流程验收、模型质量评估、费用对账或发布批准。

## 执行范围

- 恢复了现有本地 PostgreSQL、Redis、Qdrant、Milvus/etcd 容器。API 此前因数据库容器停止而以 Prisma `P1001` 重启。
- `GET /api/health/ready` 返回 HTTP 200；Interview `5173` 和 Lab `5175` 返回 HTTP 200。
- API 启动时内置 Provider 探针向 Qwen、DeepSeek 分别发起真实聊天请求，输入 `ping`、`maxTokens=1`、`temperature=0`。脱敏后的启动日志显示两者均 `health check OK`。
- API 密钥仅检查是否配置，未读取或输出其值。

## 证据与边界

这次确认了本地应用、数据库/缓存 readiness 以及 Qwen、DeepSeek Provider 的真实请求链路可用。没有调用真实候选人数据，也没有运行发布集或 Golden Benchmark。

Provider 探针直接调用 Provider 的 `chat()`，绕过 LLM Gateway 的额度、Usage Ledger 和成本追踪。响应 usage 和账单未由本次探针持久化，实际 token/费用无法核实；不得把它记作零成本。启动探针本身也不验证产品业务请求是否正确进入网关。

因此本报告只证明连通性，不代表模型质量、业务 API 端到端效果、账单对账、版本对比或 1.0.1 发布就绪。此前固定 36 样本评测仍为失败状态，已核验小计 ¥0.069285，另有中断调用费用未知；候选版本仍是 DRAFT。

## 后续

真实业务推理或续跑固定集前，需先核对组织可用额度与中断调用账单，再由用户给出本次费用上限。应单独治理启动 Provider 探针绕过网关计量的问题；本次只记录该任务，不扩大代码变更范围。
