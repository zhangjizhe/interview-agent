# 当前任务

最后更新：2026-08-15

## 任务 ID

TASK-018

## 目标

完成 B6：使用量与发布平面最小边界。

## 状态

进行中

## 范围

- 基于已有 SessionCost 建立用户/周期 Usage Ledger 与服务端额度策略点。
- 在面试和评价的高成本入口执行额度检查，保留 JWT、资源归属和 Gateway 成本归集。
- 为候选人提供只读使用量摘要，不暴露模型、Token、工具或 Provider 内部信息。
- 用服务端绕过测试、成本上限合同和浏览器验收验证 Web 不能绕过额度。

## 非目标

- Payment、订阅套餐、团队计费、完整商业化 Entitlement 或 Agent 自主预算策略。
- 重写 LangGraph 拓扑、Provider、Prompt、检索或工具执行策略。
- 依赖前端隐藏执行额度、硬编码商业套餐，或将未验证 Agent 变更发布到默认运行时。

## 相关文件

- `docs/harness/RELEASE_GATE.md`
- `docs/harness/HARNESS.md`
- `docs/product/REFACTOR_PROGRAM.md`
- `apps/api/src/modules/interview/`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/modules/llm/`
- `apps/web/src/pages/`
- `apps/web/e2e/`
- `docs/product/REFACTOR_PROGRAM.md`

## 验收标准

- Usage Ledger 按用户、周期和请求类型准确归集；服务端拒绝超额入口调用。
- Web 只显示用户可用的摘要，不能直接跳过 API/Gateway 策略。
- API/Web 合同测试、类型检查、构建和真实浏览器主路径验证有记录。
- 不调用未受控的真实 Provider；如需要真实 Provider 验证，必须单独满足成本与 Harness 门。

## 已知风险

- 现有 SessionCost 是按会话聚合，需避免重复入账、跨用户归集和因重试重复扣减。
- Provider 调用成本必须继续在 Gateway 归集；额度拒绝不能通过浏览器参数绕过。
