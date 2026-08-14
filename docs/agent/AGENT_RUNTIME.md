# Agent 运行时

最后更新：2026-08-13

## 当前运行时

`InterviewAgentService` 是产品入口。配置选择以下模式：

```text
multi（默认） -> LangGraph Multi-Agent Service
deepagents    -> 可用时使用 DeepAgents Service
其他/未就绪    -> 直接 LLM Gateway 兜底
```

默认流使用具备 LangGraph checkpoint 的 Multi-Agent 路径。LLM Gateway 路由 Qwen 或 DeepSeek，执行缓存/降级，追踪会话成本，并在配置完成时写入可观测性。浏览器接收 SSE 事件。

## 产品对齐

候选人模式必须比运行时简单：

```text
面试模式：问题、回答、追问、进度
评价模式：持久化结果、证据、下一步行动
复盘模式：历史尝试与重试
```

Planner、Executor、Reviewer、检索、工具和模型路由属于实现细节。HITL 是运维/管理员控制，不应与候选人评价混淆。

## P0 所需合同

- 每个问题需要稳定的 `skill`、可选 `subSkill`、`difficulty`、期待证据、来源与题目/版本标识。
- 每个追问需要父问题 ID 与追问目的。
- 每项评估需要评估器版本、Prompt 版本、模型、输入范围和证据链接。
- Engine 输出更新长期候选人状态前必须经过结构化校验。

当前 Prompt 通过 Git 进行源码版本管理；Prompt Registry 属于后续工作。
