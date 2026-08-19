# Agent Lab Charter

最后更新：2026-08-19

## 第一准则

**Agent Lab 是独立的 Agent 编排与控制平台；Interview 是接入 Agent Lab 的一个应用层。**

这条准则高于任何单一 UI、Demo 或临时调试需求。Agent Lab 不应被实现为候选人面试页中的内部面板，也不应以暴露 Prompt、思维链、检索上下文或工具原始输入来换取“可视化”。

## 核心目标

Agent Lab 为受控应用提供：

1. 可版本化的 Agent 定义、运行配置和策略边界。
2. 受控的工具与 MCP 生命周期、健康状态和管理员操作审计。
3. 可关联的 Trace、成本、延迟和结构化运行证据。
4. 可复现的 Dataset、Evaluation、失败分析、实验比较和发布决策。
5. 面向应用层的稳定合同，而非直接依赖某个业务页面或候选人会话 UI。

## 应用边界

Interview 是第一个 Agent Lab 应用。它继续拥有候选人身份、简历、岗位、面试、评价、技能和训练领域事实；Agent Lab 不读取或展示未脱敏的候选人数据作为默认控制台内容。

在当前增量中：

- `apps/agent-lab` 是独立构建与部署的管理员控制台。
- NestJS 仍承载已有 MCP 管理 API 和 Interview 运行时，避免在没有迁移证据时复制认证、成本或运行逻辑。
- 后续由版本化的 Agent Lab API 合同逐步从 Interview 模块提取控制面能力；这不是一次性重写 LangGraph 或 NestJS。

## 非目标

- 在候选人 Web 中展示 Agent、RAG、MCP、模型、Token、Prompt 或思维链。
- 让 Agent 自行修改 Prompt、工具配置或发布策略。
- 将一次 Trace、单次 LLM 输出或视觉展示当作质量提升证据。
- 未经 RBAC、审计、脱敏和发布门验证就开放管理操作。

## UI 与操作系统

Agent Lab 必须维护独立的 UI 信息架构和操作系统，详见
`docs/agent-lab/UI_OPERATING_SYSTEM.md`。控制面不能复用候选人训练页的导航语义、信息密度或操作入口。
