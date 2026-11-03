# 03 · Agent 运行时（LangGraph 多智能体）

> 代码：`apps/api/src/agents/multi-agent/`（2,131 行，含 7 节点 + 适配器 + 引用工具）
> 入口：`apps/api/src/modules/agent/multi-agent.service.ts`

## 1. 图结构（7 节点）

```
                    START
                      │
                      ▼
                 supervisor ──────────────┐
                      │                   │ (direct)
      ┌───────────────┴──────────┐         │
      ▼                          ▼         ▼
   planner                  respond_directly ──► END
      │
      ▼
   executor
      │
      ▼
  replanner ──► planner（replan）· executor（continue）· reviewer（finish）
                                                          │
                       ┌──────────────────────────────────┤
                       ▼                                  ▼
                  hitl_review ──► END                 END（approved）
                       │
                       └──► planner（rejected，打回重做）
```

节点职责：

| 节点 | 职责 | 输出 |
| --- | --- | --- |
| `supervisor` | 意图分类（`jd_match` / `mock_interview` / `resume_review` / `general_qa`）+ 决定直接回答还是进规划 | `user_intent` |
| `planner` | 产出 `PlanStep[]`（动作：search / memory_recall / query_knowledge_bank / ask_llm / generate_question；可指定 specialist） | `plan` |
| `executor` | 逐步执行，写回结果 | `past_steps`、`current_step_idx` |
| `replanner` | 决定 continue / replan / finish / respond_directly | 路由 |
| `reviewer` | 质量审阅：打分、产出 `issue_tags` + `reflection`；分低触发 HITL | `final_response`、`hitl_pending` |
| `hitl_review` | `interrupt()` 暂停，等 HR 审批后 `Command({ resume })` 恢复 | `hitl_verdict` |
| `respond_directly` | 闲聊直接回，不规划（省 token、省延迟） | `final_response` |

## 2. State 设计（`state.ts`）

State 用 LangGraph `Annotation.Root`，每个字段的 reducer 选择是有讲究的：

| 字段 | reducer | 为什么 |
| --- | --- | --- |
| `messages` | `messagesStateReducer`（追加） | 对话历史不能丢，checkpointer 要靠它恢复 |
| `past_steps` | 自定义合并 `[...prev, ...next]` | 增量追加，避免并发覆盖与 N² 全量展开 |
| `plan` | 默认（LastValue 覆盖） | 每次重规划应完全替换 |
| `final_response` / `user_intent` / `current_step_idx` / `retry_count` | LastValue | 单值字段 |
| `interview_context` | LastValue | **岗位约束独立于 messages 持久化**，避免把业务配置当对话内容 |
| `hitl_pending` / `hitl_verdict` | LastValue | HITL 状态机 |
| `issue_tags` / `reflection` | LastValue | ADR #10 反思：给 planner 下一轮注入，避免重蹈覆辙 |
| `current_specialist` | LastValue | Handoffs：路由到 interviewer / evaluator / searcher / general |

**实验 `state.ts` 是改 Agent 行为的第一个文件。** 加字段要考虑：会不会破坏 checkpointer 已存的旧状态（旧 checkpoint 缺字段 → 反序列化后是 `undefined`，节点必须容忍）。

## 3. 三层兜底（防止无限循环）

| 层 | 机制 | 位置 |
| --- | --- | --- |
| 局部 | `retry_count >= 3` 强制进 reviewer | reviewer / executor 节点 |
| 图级 | `INTERVIEW_GRAPH_RECURSION_LIMIT = 60`，`graph.invoke(input, { recursionLimit })` | `graph.ts` 导出常量 |
| 应用级 | 捕获 `GraphRecursionError` → 返回"评审失败"模板 | 上层 service |

注意注释里的一个坑：**LangGraph v1.x 的 `compile()` 已移除 `recursionLimit` 类型签名**，必须在 `invoke` 时传。写在 `compile()` 里不会报错但不生效。

## 4. HITL：真的会停住

```ts
// graph.ts:129 —— hitlReviewNode
const verdict = (interrupt as any)('HITL: 评分争议，等待 HR 审批') as 'approved' | 'rejected';
```

- 触发条件：reviewer 判定评分争议（score 偏低）→ `hitl_pending = true`
- 暂停后：`GET /api/hitl/graph-status/:interviewId` 可查停在哪
- 恢复：`POST /api/hitl/graph-resume/:interviewId` → `Command({ resume: 'approved' | 'rejected' })`
- approved → `END`；rejected → 回 `planner` 重做

**改 HITL 时注意**：`interrupt()` 依赖 checkpointer（`PostgresSaver`）。没有 checkpointer 就没有暂停能力，这是 `multi-agent.service.ts` 里必须先连 `PostgresSaver` 才能编译图的原因。

## 5. 网关适配器（关键中间件）

`llm-gateway-chat-model.ts`（425 行）继承 `BaseChatModel`，让 LangGraph 节点的 `model.invoke()` 实际走 `LlmGatewayService`：

```
节点里的 model.stream()
   → LlmGatewayChatModel._streamResponseChunks()
        → llmGateway.streamChat(params, provider)
             → quota 预留 → provider → 语义缓存 → 成本记账
```

两个设计要点：

1. **`AsyncLocalStorage` 透传 threadId**：`BaseChatModel._generate` 拿到的 `ParsedCallOptions` 里没有 `configurable`，节点也未必透传 config；所以用 ALS 在 run/stream 入口设置 `threadId`，`_generate` 从 ALS 读。这解决了「缓存按会话隔离」的归属问题。
2. **`provider` 字段是硬编码联合类型** `'qwen' | 'deepseek'`（`llm-gateway-chat-model.ts:39/80`）——这是 GPT 接入必须改的第二处（第一处是 `LLMProviderName`）。

## 6. 引用与幻觉抑制（ADR #11）

`citation.ts`（179 行）实现 CRAG-lite：

1. 检索结果加 `[1] [2]` 标记（`sourceType`: knowledge_bank / memory / github_repo / web_search）
2. Prompt 强制要求引用
3. Reviewer 检查 `final_response` 的事实能否映射到引用编号 → 不能则 `no_citation` → 打回

这是"面试官不能瞎编技术细节"的工程保障。改 prompt 或换模型时，**这段校验是最容易被破坏的**：新模型的引用习惯不同（例如 GPT 更倾向于不写 `[N]`），reviewer 会大量误判 `no_citation`。

## 7. 流式生产路径的两条岔路

`multi-agent.service.ts` 注释（第 257 行起）记录了一次真实踩坑：

- 走 `StreamMessagesHandler` 监听 `handleLLMNewToken` 时，`LlmGatewayChatModel`（继承 BaseChatModel）**回调链路会断**；
- 最终方案：节点内 `collectStreamText → model.stream → LlmGatewayChatModel._streamResponseChunks`。

所以改流式时不要引入"看起来更优雅"的 callback 方案，会退回已修过的坑。

## 8. 与记忆/检索的关系

| 能力 | 在节点里怎么用 |
| --- | --- |
| `memory_recall` | 读四层记忆（Postgres/Redis/Qdrant/Milvus + Mem0） |
| `query_knowledge_bank` | 题库检索（canonical catalog + retrieval index 双轨） |
| `search` | MCP 工具（如 `bocha_search`） |
| `ask_llm` | 直接调模型（受额度约束） |

Planner 的 `PlanStep.action` 枚举就固定了这几类，新增动作要同时改 `PlanStepSchema` 和 executor 的分支。

---

[← 返回索引](./Home.md)　|　上一篇：[02 Interview 业务](./02-interview-domain.md)　|　下一篇：[04 · LLM 网关](./04-llm-gateway.md)
