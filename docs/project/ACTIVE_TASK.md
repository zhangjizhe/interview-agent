# 当前任务

最后更新：2026-08-15

## 任务 ID

TASK-014

## 目标

完成 B3：建立目标岗位单活跃约束、岗位档案版本与版本化准备度合同。

## 状态

完成

## 范围

- 用数据库部分唯一索引强制每位用户至多一个活跃岗位。
- 为 TargetJob 和岗位技能要求保存可递增档案版本，准备度响应必须带版本。
- 保持现有岗位创建、切换、所有权和无证据不出分语义。
- 为并发冲突、跨用户拒绝和版本化准备度增加合同测试。

## 非目标

- 训练推荐、SSE 断点续传、额度或支付。
- 改变 LangGraph 拓扑、Provider、Prompt、检索和工具执行策略。
- 使用 LLM 重写 JD 分析或回填旧岗位版本。

## 相关文件

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/`
- `apps/api/src/modules/interview/services/job-readiness.service.ts`
- `apps/api/src/modules/interview/controllers/skill-profile.controller.ts`
- `apps/api/src/__tests__/`
- `apps/web/src/utils/training.ts`
- `docs/product/REFACTOR_PROGRAM.md`

## 验收标准

- 数据库拒绝每用户多个活跃岗位，且创建/切换服务将冲突映射为业务错误。
- 岗位更新后档案版本递增，Readiness API 返回对应 profile version。
- 无 FINAL 技能证据时仍返回 `overallScore: null` 与缺失原因。
- API/Web 合同测试、类型检查、构建和迁移验证有记录。

## 已知风险

- 现有 target_jobs 可能来自 B1 前的 Schema，migration 必须先检查重复 active 记录。
- Prisma datamodel 无法表达 PostgreSQL 部分唯一索引，物理约束必须保留在加性 SQL migration 和测试中。

## 交付结果

- `target_jobs_one_active_per_user_key` 部分唯一索引强制每位用户最多一个活跃岗位。
- TargetJob 更新会递增 `profileVersion`；准备度响应和 Web 合同携带该版本。
- 创建或切换中的数据库唯一冲突会返回可重试的业务冲突，不依赖 UI 隐藏。
- 加性 migration 已在隔离 Baseline 与本机开发库执行，且 Prisma 状态正常。
