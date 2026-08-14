# 当前任务

最后更新：2026-08-14

## 任务 ID

TASK-006

## 目标

基于真实目标岗位和准备度 API，交付候选人训练平台的 Web Shell、岗位设置、准备度首页、面试记录和评价失败恢复状态。

## 状态

已完成

## 范围

- 重构候选人主导航与首页信息架构。
- 新增目标岗位设置和准备度/证据不足状态。
- 将现有面试列表迁入“面试记录”语义。
- 为已结束但没有成功报告的面试提供明确的失败与恢复状态。
- 复用现有登录、简历上传、开始面试、报告与管理员路由。

## 非目标

- 训练推荐生成、训练界面、SSE Payload 改版、Question Selection 改版、额度/支付、Prompt 或 Agent Engine 改动。
- 伪造技能趋势、训练计划或准备度分数。

## 相关文件

- `apps/web/src/App.tsx`
- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/pages/InterviewPage.tsx`
- `apps/web/src/index.css`
- `apps/web/src/components/`
- `apps/api/src/modules/interview/controllers/skill-profile.controller.ts`
- `apps/api/src/modules/interview/services/job-readiness.service.ts`

## 验收标准

- 候选人可在 Web 中创建并选择目标岗位、粘贴可选 JD、开始对应岗位面试。
- 首页准确呈现 API 的准备度、置信度和证据不足原因。
- 现有面试可继续或打开报告；报告失败时有恢复提示，不显示伪造分数。
- 桌面与移动端不出现布局溢出、文本遮挡或内部 Agent 信息泄露。
- Web typecheck、Vitest、生产构建与浏览器验收通过。

## 已知风险

- 本机数据库 Migration 尚未应用，开发服务器需要可用 API 数据或清晰的 API 失败状态。
- 现有 HomePage 较大，重构时必须保留简历上传、空面试清理和资源归属行为。

## 交付结果

- 候选人训练平台 Web Shell，包含首页、面试记录和岗位设置导航。
- 目标岗位创建、编辑、切换和可选 JD 的 Web 设置页。
- 基于真实 Readiness API 的准备度、置信度与证据不足状态。
- 简历上传后按当前 `targetJobId` 创建面试，保留岗位归属。
- 已结束但无报告的面试显示无分数恢复状态，可重试生成评价。
- 候选人面试页面不再呈现 Token、工具、MCP、Agent 调用或内部复核细节。
- Web 页面与工具函数测试、类型检查和生产构建。
- API Docker 构建会在 Nest 编译前基于当前 Schema 生成 Prisma Client，避免新模型/枚举在镜像构建中丢失。
