# 上下文变更日志

最后更新：2026-08-26

## 2026-08-26

新增：

- B6 Usage Ledger、配置化服务端月面试额度和候选人安全使用量摘要。
- Docker API 主路径额度验收与 B6 发布报告。

变更：

- 面试创建在服务端额度耗尽时返回 `429`；浏览器不能绕过。
- Docker 镜像构建使用 BuildKit pnpm 持久缓存和官方 registry，减少网络重试的重复下载。

## 2026-08-15

新增：

- B0 真实浏览器验收，覆盖候选人登录、目标岗位创建、USER/ADMIN 隔离和移动端登录页。
- 无 Provider 的 Golden Dataset Schema 校验命令与 B0 验收报告。
- B1 单一 Prisma Baseline、数据库备份/恢复/指纹脚本和独立 Docker migration job。
- B2 成功 FINAL 评价到 CandidateSkillState 的事务性、可追溯聚合。
- B3 TargetJob profile version 与数据库级单活跃岗位约束。
- B4 Interview Mode、目标岗位技能练习、题目选择快照、候选人消息幂等和完成回复重放。
- B5 基于 FINAL Evidence 的单技能 TrainingRecommendation、TrainingAttempt 和关联复测入口。

变更：

- 候选人 SSE 只传递文本、可操作错误和完成信号；Agent、工具、检索、模型和 Token 成本事件在 API/Web 双层过滤。
- `TASK-011` 完成；Production Migration Baseline 仍是下一独立批次。
- API 运行时不再运行 `db push` 或 checkpoint DDL；readiness 现在要求 Baseline、PostgreSQL 和 Redis 均可用。
- 正式技能状态只由成功 FINAL Evidence 重算；非正式、失败或降级评价不影响候选人准备度。
- 准备度现在属于明确的岗位档案版本；活跃岗位并发冲突由服务端拒绝。

## 2026-08-19

新增：

- 独立 `apps/agent-lab` MCP 治理控制台、Docker 服务、管理员登录门和浏览器验收。

变更：

- 候选人工具偏好页不再调用、展示或操作系统级 MCP 管理接口。
- 候选人流式重试复用客户端消息 ID，已完成请求不会重复写入回答或进入 Agent 成本路径；逐 token Event ID/Offset 续传仍未实现。
- 训练完成只记录 Attempt，不能直接提高 CandidateSkillState；正式变化仍依赖后续成功 FINAL 评价。

## 2026-08-14

新增：

- 候选人训练平台 Web Shell：首页、面试记录与岗位设置导航。
- TargetJob 与可选 JD 的前端创建、编辑、激活流程。
- Readiness API 的准备度、置信度、构成项和证据不足状态。
- 已结束但无报告时的评价重试入口与 Web 合同测试。
- Docker API 构建顺序修复：Prisma Client 现在在 Nest 编译前基于最新 Schema 生成，避免新模型与枚举导致镜像构建失败。

变更：

- 新面试从当前目标岗位发起并传递 `targetJobId`。
- 候选人首页和面试页不再显示 Token、工具、MCP、Agent 调用、模型或内部复核细节。
- `TASK-006` 完成；训练建议、SSE 合同与额度边界仍保持独立后续任务。
- 本机 Docker API 已重建并按授权同步开发 Schema，`target-jobs` 路由已启动；生产 Migration Baseline 仍是单独部署前置。

## 2026-08-13

新增：

- `docs/project/` 下 Repository 驱动的 Codex Context Management Layer。
- Context Router、Active Task Contract、Task Register 和 Thread Handoff 格式。
- P0 面试训练产品审计、信息架构、Agent 对齐和 Harness 运行规格。

变更：

- `AGENTS.md` 要求选择性加载上下文，并在任务完成时更新上下文。
- 确立“先证据，后训练结论”决策和 P0 实施顺序。
- P0-1 补充问题/回答/证据外键链路、不可变版本、幂等、权威评估生产者与重跑策略。
- 评估幂等范围补充 Prompt、模型和运行模式；明确 EvaluationRun 历史与 Report 展示快照策略。
- 已实现 P0-1 评估基础：规范化问题/回答、不可变评估定义/运行/证据、Report 展示快照、受保护只读 API 和合同测试。
- 已实现目标岗位、文本 JD 导入、本地岗位技能关键词映射、岗位关联面试和透明准备度 API。

本次新增数据库 Schema、Migration、API 和最终评价写入边界；未修改 UI、RAG、Memory、Prompt 或 Agent Engine。
