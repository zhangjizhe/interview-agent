# 实验协议

最后更新：2026-08-13

每次 Agent、评估器、Prompt、检索或选择策略改动都需要一份实验记录：

```text
experiment_id
hypothesis
control version
treatment version
dataset version
metrics and thresholds
run configuration
results
failure analysis
decision
```

必须对比：

- 质量与安全；
- 结构化输出有效率；
- 延迟；
- Token 使用量与估算成本；
- 按 Failure Taxonomy 标签统计的失败率变化。

不能因为一次聊天“看起来更好”就改生产 Prompt。实验上线需要通过 Release Gate；当质量/成本取舍显著时需人工决策。
