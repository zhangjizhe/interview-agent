# Dual Application Delivery Program

最后更新：2026-08-20

## Product Boundary

```text
Agent Lab (control plane)
  -> Runtime, MCP, Trace, Evaluation, Experiment, Release

Interview (application plane)
  -> Resume, Job, Interview, Evaluation, Skills, Training, Retest
```

两个应用共享受控认证、API、成本与发布门，但不共享候选人页面、内部运行信息或领域事实写入责任。

## Agent Lab V0.1

```text
管理员允许名单
-> 创建管理员账号
-> 登录独立控制台
-> MCP 服务治理
-> 编排运行视图
-> Harness 验收
-> 发布决策
```

禁止自助提权、Prompt 自修改、未审计工具写入和候选人原始数据查看。

## Interview V0.2

```text
注册
-> 目标岗位
-> 简历
-> 模拟面试
-> FINAL Evaluation
-> 技能状态
-> 训练
-> 复测
```

每个分数、训练建议和复测必须沿用户、岗位、技能、问题、回答和 FINAL Evidence 回溯。

## Release Gates

| Gate | Agent Lab | Interview |
| --- | --- | --- |
| Product | 操作任务与权限语义明确 | 用户旅程、空态和失败恢复明确 |
| Architecture | 控制面不写业务事实 | 应用层不暴露控制面数据 |
| Security | ADMIN、审计与配置边界 | JWT、Ownership、输入与 SSE 边界 |
| Testing | Build、RBAC、MCP 浏览器验收 | API、Web、浏览器、迁移、训练闭环 |
| AI | Dataset/Harness/发布决策 | Gateway、质量与成本门 |
| Operations | Trace、失败与发布记录 | Usage、Quota、漏斗与反馈 |

任一门不通过时，不得宣称对应应用已完整交付。
