# 当前架构地图

更新：2026-10-08。默认产品为模块化单体；详细旧地图[归档](archive/release-readiness-2026-10-08/ARCHITECTURE_MAP.md)，代码优先。

| 层 | 入口 | 当前合同 |
| --- | --- | --- |
| Interview | apps/web/src | JWT 会话、候选人导航、岗位/简历/面试/报告与训练入口 |
| Lab | apps/agent-lab/src | ADMIN 门禁、MCP/题库/录制报告与 ControlledEvolutionWorkspace |
| 授权 | apps/api/src/modules/auth | 全局 JWT、ADMIN RBAC、用户资源归属与组织范围 |
| 面试 | apps/api/src/modules/interview | 持久化业务状态、回答/正式证据、手动 SSE、训练关联 |
| Agent | apps/api/src/agents/multi-agent、modules/agent | LangGraph、checkpoint、受控版本与 Gateway adapter |
| 模型 | apps/api/src/modules/llm | Qwen/DeepSeek、原子额度、集中费率证据、完整请求答案缓存 |
| 平台 | apps/api/src/modules/agent-lab | AgentVersion/Application/Run/Trace/Evaluation 与 v4 发布门 |
| 评测任务 | 同模块 EvaluationJobsService | PostgreSQL PENDING/RUNNING、requestKey、资产指纹、CAS 租约/进度及 CANCELLED；取消在样本边界结算、不重放 |
| 检索 | modules/knowledge-base、modules/memory | Milvus 混合检索、Qdrant；旧答案相似缓存不再读取 |
| 数据 | apps/api/prisma | PostgreSQL，租户/额度/冻结证据约束与加性任务迁移 |
| 观测 | infra/observability | Prometheus/Grafana；进程指标重启归零，完整账单另核验 |
| 交付 | docker-compose.yml、三端 Dockerfile | migration 独立先行、pnpm 9 冻结依赖与 patches、API readiness；本机映射仅绑定 loopback，Redis AOF 与 noeviction |
| CI | .github/workflows/ci-api.yml | 严格 lint/type/test、Redis、专用 PG 升级与三端镜像；API smoke 写入 Milvus，并对 PostgreSQL/Milvus+etcd/Qdrant 做隔离恢复；不吞掉失败 |

答案缓存只复用完整主模型文本；指纹含租户/用户/面试、系统/历史/模型/有效参数/套餐，Redis TTL 一小时。工具、截断、fallback 与旧缓存不复用；Lab 评测始终 bypass。

发布 Dataset 冻结与审查后进行有界重复评测；同集统计/切片/资源/费率/缓存隔离证据齐备才可人工发布。录制 Harness 的人工决定与真实 Agent 发布分离。无 OS 沙箱、远程 worker 或自动付费重试；py-api 实验实现不作产品路径依据。

安全迁移保持 Node 20/React 18，braces 补丁覆盖字符串与 AST；CI 保留上游 high 并验证固定补丁。ContextManager 缓存以完整内容/role/tier SHA-256 区分决策，容量 1000、命中刷新 LRU。全部旧 Jest 排除已解除；真实模型与生产验收另核验。

Lab Golden Dataset 版本按 organizationId/version 唯一，可信租户上下文 upsert；不同组织有独立同版本记录，旧 ID/关系保留。首次新组织 dashboard 已纳入实际镜像 HTTP 与专用 PG 回归。

## 配置运行时演进（2026-10-08）

AgentLab扩展ConfiguredRuntimeService与ConfiguredRunJobsService；AgentVersion.runtimeConfig保存single-agent-v1/finite-workflow-v1，Run保存队列幂等/租约与父子节点。调用统一Gateway且禁用自动fallback，Trace记录真实节点；发布门不变。新增202 test-runs/runs/cancel、runtime/models和事务configured-agents入口。加性迁移 `20261008030000_configured_run_jobs`。实施/验收中，不代表整产品交付，详见 `docs/architecture-decisions.md` ADR 22。

题库embedding/rerank统一走LlmGateway→QwenProvider，并由QuotaService在外部请求前预留LLM_CALL、在UsageLedger.metadata结算usage/估算或未知；正文不入receipt。辅助模型价格目录2026-10-09.1。此变更20迁移部署状态见当前活动任务。
