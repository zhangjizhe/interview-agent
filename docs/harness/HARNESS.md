# Agent 评测框架

最后更新：2026-08-13

## 目标

Harness 用于判断 Agent/评估器变更是否在质量、安全、延迟和成本可接受的前提下改善产品。

```text
数据集 -> 运行 -> Trace/证据 -> 评估器 -> 对比 -> 报告 -> 发布决策
```

## 当前资产

- Golden Dataset Schema，30 个 Case / 60 个回答样本。
- Evaluation Runner 与 JSON/Markdown Reporter。
- 带质量阈值的 Jest/Vitest 回归测试。
- ReflectionLog、LLM Gateway Token/成本追踪，以及可选 Langfuse Trace。

## 缺口

- 没有与 Agent/Prompt 版本绑定的不可变运行记录。
- 没有对照组/实验组的成对比较。
- 没有统一 Failure Taxonomy 或人工审查工作流。
- 没有发布决策产物。

## 运行规则

Harness 结果是发布证据，不是面向候选人的产品分数。被测 Agent 不得静默修改这些结果。
