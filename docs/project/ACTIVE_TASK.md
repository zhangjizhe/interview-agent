# 当前任务

最后更新：2026-08-20

## 任务 ID

TASK-021

## 目标

完成 Interview V0.2 的候选人产品主流程与页面级验收。

## 状态

完成

## 范围

- 注册、目标岗位、简历上传、完整模拟与单技能练习的可用流程。
- 面试完成、FINAL 评价、训练推荐、训练完成和复测入口的页面状态。
- 真实 API 驱动的加载、空、失败、权限和移动端体验。
- API/Web/浏览器验收覆盖不调用 Provider 的主流程边界。

## 非目标

- 修改 Agent Lab 控制面、Provider、Prompt、检索或 LangGraph 拓扑。
- 将未完成的 Provider 质量验证伪装为产品验收。
- Payment、订阅、团队、多租户或小程序。

## 验收标准

- 候选人可在真实界面完成岗位和简历前置，理解完整模拟与单技能练习差异。
- 评价、训练与复测入口只在真实后端状态允许时出现；无 Evidence 不显示伪造能力结论。
- 桌面/移动浏览器路径、API/Web 测试、类型检查和构建通过。
- 未调用真实 Provider 时，验收记录明确其边界。

## 已知风险

- 完整 FINAL Evaluation 依赖受控 Provider 或录制响应，不能在普通浏览器验收中无界触发。
- 已有页面必须保留 JWT、Ownership、SSE 候选人事件边界和训练不直接改分不变量。

## 交付结果

- 候选人工作台布局、移动导航、岗位/简历前置、完整模拟/单技能选择、训练空态和权限边界已接入真实 API。
- 浏览器验证岗位版本、单活跃约束、无 FINAL Evidence 的准备度和训练空态，未伪造能力或训练结论。
- 2026-08-20 验证：API 29 suites / 256 tests、Cache 22 tests、Interview Web 13 files / 78 tests、API/Web build、Docker readiness 和候选人浏览器 23/23 通过。
- 未调用真实 Provider；Provider 质量、延迟和成本验收由 Harness canary 独立执行。
