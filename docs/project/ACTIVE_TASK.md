# 当前任务

最后更新：2026-08-20

## 任务 ID

TASK-020

## 目标

完成 Agent Lab V0.1 的受控管理员账户引导、独立控制台工作流与验收。

## 状态

进行中

## 范围

- 管理员允许名单、注册、登录、普通用户拒绝与会话隔离。
- 独立控制台的信息架构、受控编排运行视图、MCP 服务治理和错误反馈。
- 建立 Interview 与 Agent Lab 独立 UI 产品系统，并在当前控制台和候选人应用壳中落地导航、状态和响应式规范。
- `apps/agent-lab` 独立构建、Docker 部署和浏览器验收。
- 候选人 Web 保持个人工具偏好，不能调用 MCP 系统级控制 API。

## 非目标

- Agent 自助提权、Prompt 自修改、未审计工具写入或候选人原始数据查看。
- 拆分 NestJS、LangGraph、Provider、Prompt、检索或 Interview 领域数据。
- Trace、Experiment、Release 的完整后端 API 与数据模型。

## 验收标准

- 配置在 `ADMIN_USER_IDS` 的账号能注册并登录 Agent Lab；普通用户被拒绝。
- 独立控制台提供概览、编排运行视图和 MCP 治理，操作具有空闲、进行中、成功和失败反馈。
- Agent Lab 仅调用现有受 ADMIN RBAC 保护的控制 API，候选人 Web 不保留 MCP 系统管理操作。
- Agent Lab/Web build/typecheck、管理员/普通用户浏览器验收和 Docker 部署通过。

## 已知风险

- 管理员允许名单是部署配置，不得通过浏览器或公开 API 修改。
- MCP 状态仍是进程内状态；跨重启持久化和操作审计不属于本任务。
- 编排视图只展示受控阶段，不得暗示已实现实时 Trace 或泄露思维链。

## 交付结果

- Agent Lab 具备独立管理员登录/注册入口；允许名单账号可获得控制面权限，普通账号注册后被明确拒绝。
- 独立控制台提供概览、编排运行视图和 MCP 治理，候选人 Web 只保留用户级工具偏好。
- Agent Lab 和候选人 UI 采用各自的信息架构与工作台布局，并有导航与 MCP 边界回归测试。
- 管理员登录、控制台加载、普通用户拒绝浏览器验收，以及 Agent Lab/Interview Web build/typecheck 均通过。
