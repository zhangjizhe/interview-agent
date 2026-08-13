# Agent Optimization Workflow

```text
Baseline
-> Trace
-> Failure Analysis
-> Dataset
-> Hypothesis
-> Experiment
-> Evaluation
-> Regression
-> Human Approval
-> Release
```

## 实验记录

每次实验必须记录：

- Experiment ID、假设、基线、变更。
- Agent/Prompt/Model/Tool 版本。
- Dataset、Quality、Latency、Token、Cost、Tool Calls。
- 结果、结论（Adopt/Reject/Continue）和回滚方式。

## 强制边界

Agent 不得直接自主修改生产 Prompt。正确流程是：

`Proposal -> Harness -> Evaluation -> Human Approval -> Release`

缓存命中次数不是成本优化结论；必须比较实际 Token、延迟、成本与质量。
