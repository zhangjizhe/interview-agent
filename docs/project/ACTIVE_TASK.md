# 当前任务

最后更新：2026-09-02

## 任务 ID

TASK-029

## 目标

为 Agent Lab 离线评测增加受控调度设计与 mock 执行合同。

## 状态

进行中

## 范围

- 定义可配置、可暂停的离线评测调度请求合同与运行状态。
- 仅使用录制/mock 输入验证调度幂等、并发、超时和审计边界。
- 保留现有 Receipt、Run、Experiment、Decision 与操作日志事实，不自动发布或调用 Provider。

## 非目标

- 真实 Provider 批量调用、自动发布、候选人 API 变化或读取本机自由路径。
- 重写 LangGraph、Interview 领域、Provider、RAG、Billing 或现有控制面合同。

## 验收标准

- 调度声明和执行结果可追溯且幂等；暂停和超时不会产生重复 Run。
- mock 执行不触发 Provider、部署或候选人数据读取。
- API、Docker 和相关验收通过；不调用 Provider。

## 已知风险

- 调度若直接调用 Provider 或绕过发布门，会突破成本和发布边界。
- 定时任务与录制 Receipt 导入必须保持不同的权限与审计路径。
