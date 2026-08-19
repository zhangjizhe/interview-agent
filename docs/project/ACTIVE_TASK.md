# 当前任务

最后更新：2026-08-19

## 任务 ID

TASK-019

## 目标

建立独立 Agent Lab 平台的最小可用边界，并将 MCP 管理从候选人 Web 迁入该控制台。

## 状态

完成

## 范围

- 将“Agent Lab 是独立 Agent 编排与控制平台，Interview 是其应用层”写入项目宪法、Agent Lab Charter 与架构决策。
- 新建独立可构建、可部署的 `apps/agent-lab` 管理员控制台。
- 为 Agent Lab 定义独立控制台 UI 与操作系统，不复用候选人训练导航或交互语义。
- 将 MCP 服务查看、系统级启停、健康检查与配置重载迁入 Agent Lab。
- 修复 MCP 管理操作的错误反馈、请求状态和按服务健康检查结果。
- 候选人 Web 保持用户级工具偏好，不再承载 MCP 系统管理入口。

## 非目标

- 立即拆分或重写 NestJS、LangGraph、Provider、Prompt、检索、成本归集或 Interview 领域数据。
- Agent Lab 完整运行时 API、Prompt Registry、实验 UI、自动优化或跨应用多租户。
- 在候选人界面暴露 Prompt、思维链、检索、工具、模型或 Token 内部数据。

## 相关文件

- `docs/agent-lab/CHARTER.md`
- `docs/agent/AGENT_RUNTIME.md`
- `docs/harness/HARNESS.md`
- `apps/agent-lab/`
- `apps/api/src/modules/interview/admin-mcp.controller.ts`
- `apps/web/src/pages/ToolsPage.tsx`

## 验收标准

- Agent Lab 有独立 package、开发端口、生产镜像和部署服务，能独立构建。
- MCP 管理仅由管理员控制台调用现有受 RBAC 保护的 API；候选人 Web 不保留系统级操作。
- 管理页对加载、操作中、成功和失败状态有准确反馈；服务级健康检查不会串卡。
- API/Web/Agent Lab 的相关测试和构建通过，且不调用真实 Provider。

## 已知风险

- 当前控制面 API 暂由 NestJS Interview 模块承载；独立前端不等于已完成运行时拆分，必须在后续 API 合同稳定后迁移。
- MCP 的系统级启停目前是进程内状态；重启与配置重载的持久化策略不属于本次范围。
- 管理员令牌不得进入候选人 Web、静态配置或构建产物。

## 交付结果

- `apps/agent-lab` 已作为独立 Vite/React 控制台、Docker 镜像和 Compose 服务交付，端口为 `5175`。
- 控制台使用独立管理员登录门，仅通过现有受 RBAC 保护的 MCP API 执行状态、启停、健康检查和配置重载。
- 候选人 `ToolsPage` 已移除 MCP 系统状态、系统级启停和管理入口，只保留个人工具偏好。
- Agent Lab 本地管理员/普通用户浏览器验收、独立 build/typecheck、候选人 Web typecheck、Docker 静态入口和 API readiness 均通过。
