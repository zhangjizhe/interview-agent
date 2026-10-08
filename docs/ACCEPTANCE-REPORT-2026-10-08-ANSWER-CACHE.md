# Interview 答案缓存优化交付报告

日期：2026-10-08。任务：INTERVIEW-CACHE-CONTEXT-1。分支：agent-lab。

本阶段完成答案缓存正确性优化与本机工程验收。完整项目仍有付费产品 canary、可信版本评测、完整训练闭环及生产交接待办，不声明商用生产发布完成。

## 完成内容

旧缓存只使用最后一句用户消息，并用大小写/空白归一和语义相似度复用答案；同一句问题在不同策略、历史或模型下可能复用旧结果。现在仅在完整请求相同时复用完整主模型文本答案：

- SHA-256 指纹覆盖完整系统/用户/助手消息、当前模型输入、有效生成参数、认证组织/用户、面试、主路由 Provider/Model 与当前套餐约束；同步和流式分开。
- Redis 使用 `sc:answer:v2:` 命名空间和一小时 TTL。旧 Redis/Qdrant 记录不读取、不改写、不删除；答案缓存不再调用 embedding 或相似向量检索。
- 缺失认证用户、不支持的上下文、工具请求/历史、黑名单、不可用或禁用套餐、超大输入不能命中；截断、异常、工具事件、fallback 不写。
- 套餐只读查询不消费模型额度；miss 继续通过既有原子预留。若预留时实际输出上限变化，不向旧桶写入结果。命中记录零 Token，流式也提供零 usage。
- Redis 故障只令缓存失效。Lab 评测继续绕过答案缓存，v4 发布门、正式 Agent 版本和草稿均未修改。

## 修改与影响

| 领域 | 变化 |
| --- | --- |
| 实现 | Gateway、SemanticCacheService 兼容入口、独立请求指纹函数、QuotaService 只读约束方法 |
| 验证 | 新增同步/流式、指纹、存储及显式启用的真实 Redis 集成测试；扩展额度测试 |
| 架构 | 复用 NestJS/Prisma/Redis；详见 architecture-decisions.md ADR 17 |
| 数据库 | 无 Schema、迁移或账本重置；真实只读查询已验证 |
| API/UI/依赖 | 无公开接口、界面或依赖变化 |
| 安全 | 认证身份控制复用边界，调用方 userId 不能替代；key 不含身份或问题原文，日志不输出缓存内容 |
| 成本 | 命中率可能降低，miss 的模型调用/延迟/费用可能增加；新增一次套餐只读查询；移除答案 embedding，但未证明净费用降低 |

## 验证结果

| 验证 | 结果 |
| --- | --- |
| 最终 API Jest（含真实 Redis） | 77 suites / 600 tests 通过；14 条专用 PostgreSQL 测试因未提供隔离测试数据库跳过 |
| 既有 Cache 测试 | 22/22 通过 |
| Web Vitest | 15 files / 83 tests 通过 |
| 工作区 typecheck / lint / build | 通过；lint 保留 4 条既有 warning，无 error |
| 纯暂存源码复验 | 从 HEAD 加本次暂存差异导出；API 600 tests 和 API build 通过，复用已安装 Node 20/依赖，不代表全新安装验收 |
| 真实 Redis + 离线模型 fixture | 2/2 通过；精确命中、策略/模型/套餐/用户/组织变更 miss，12 用户并发隔离、TTL/过期及流式零 usage |
| 最终 API Docker build / 本机启动 | 通过；容器 healthy，readiness 200，PostgreSQL/Redis/migration 均 ok |
| Interview / Lab HTTP | 两端均 200 |
| 真实 PostgreSQL 套餐读取 | 合法约束返回，租户 middleware 正常，前后额度账本数量相同 |
| Diff / 隐私 | 检查主题差异，无新增凭据、用户数据或本机路径；原有编辑保留 |

可复现命令（在仓库根目录）：

```sh
ANSWER_CACHE_TEST_REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @interview-agent/api test:jest --runInBand
pnpm --filter @interview-agent/api test:unit
pnpm --filter @interview-agent/web test
pnpm typecheck
pnpm lint
pnpm build
docker compose build api
```

Redis 验收需显式提供测试 URL；仅使用随机合成身份和本次生成的键，结束清理这些键，不清空数据库。初次 API 标准测试的 tsx 临时 IPC 被沙箱拦截，允许本机 IPC 后标准命令通过；最终补充工具事件回归后的全量 Jest 为上表结果。

## Evaluation / Benchmark 与未完成事项

本轮证明缓存正确性，不证明面试质量提升或真实 Token/延迟/费用净收益。上述 Redis 和 Gateway 验证使用离线合成模型，不新增付费业务样本；API 重启保留既有两个 Provider 的单 Token 启动健康探针，它们不属于业务 Benchmark。

产品有界真实 canary 和正式基线/候选评测仍需先核验月度额度与既有中断费用，再确认新预算。没有重置账本、改变套餐、重跑候选或自动发布。旧固定集的术语评分也不足以证明完整面试质量。

本机容器包含既有未提交的题库权限编辑；本次提交不合入它。当前运行不等于干净生产发布，最终交接需独立审查原有编辑并从干净检出复现部署。

后续按 COMPLETE_DELIVERY_PLAN 分主题推进：评测异步任务/重复提交保护、Lab 进度与拒绝理由、完整训练闭环、干净部署；旧 Qdrant 缓存保留/清理和旧缓存 Benchmark 脚本适配作为独立任务。固定模型别名背后版本更新无法由本地指纹实时发现，一小时 TTL 仅限制复用窗口。
