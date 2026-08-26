# 当前任务

最后更新：2026-08-20

## 任务 ID

TASK-018

## 目标

完成 B6：基于 SessionCost 建立最小 Usage Ledger、服务端额度策略与受控发布记录。

## 状态

完成

## 范围

- 按用户、自然月和 `INTERVIEW_START` 记录幂等 Usage Ledger。
- 在创建面试前服务端检查配置化额度，浏览器不能绕过。
- 候选人只读取面试次数与剩余额度摘要，不显示模型、Token、工具或 Provider 细节。
- 为 Agent/Harness 发布记录补最小版本、数据集、质量/成本状态合同。

## 非目标

- Payment、订阅套餐、团队计费、完整 Entitlement 或 Agent 自主预算策略。
- 改写 Provider、Prompt、LangGraph、RAG 或候选人 SSE 合同。
- 用前端隐藏、静态额度或未验证 Agent 变更替代服务端策略。

## 验收标准

- 同一 Interview 只能创建一条对应 Usage Ledger；重试不会重复消耗额度。
- 超额用户无法通过 API 直接创建面试，返回结构化额度错误。
- 候选人使用量摘要经过 JWT 作用域限制，且不暴露内部成本。
- API/Web 测试、typecheck/build、Docker 与浏览器路径通过；Provider 调用维持为零。

## 已知风险

- SessionCost 是会话级聚合，Ledger 只能作为访问策略和产品摘要，不能重复统计 Provider 成本。
- 额度配置必须在服务端读取，不能以套餐/价格硬编码。

## 交付结果

- `UsageLedger` 以用户、自然月、请求类型和 Interview 唯一键记录访问事实，重试不重复消耗额度。
- `QUOTA_MONTHLY_INTERVIEW_LIMIT` 是服务端配置；为空时不启用额度，正整数时创建面试前强制检查。
- 候选人首页仅显示面试次数与剩余次数，不显示 Token、Provider、模型、工具或成本。
- Docker 主路径验证 `0/1 -> 1/0 -> 429`，并在验收后恢复默认未配置额度状态。
