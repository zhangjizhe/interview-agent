# Interview Agent 产品目标宪法

> 状态：Active
>
> 适用范围：Interview Agent 产品主线与 AgentLab 平台演进
> 最后更新：2026-08-20

## 1. 产品使命

Interview Agent 是面向技术岗位候选人的 AI 模拟面试产品。用户完成简历确认后，应获得与目标岗位、职级和自身经历一致的多轮面试、可解释的反馈，以及可回溯的成长报告。

AgentLab 是产品的能力平台，不是脱离业务的独立演示台。Interview Agent 是它的第一个真实应用：平台能力必须先改善面试的可控性、可评测性、安全性或可观测性，再扩展到更多应用。

## 2. 产品闭环

```mermaid
flowchart LR
  Candidate[候选人] --> Resume[上传并确认简历]
  Resume --> Interview[按岗位与职级发起面试]
  Interview --> Stream[SSE 流式追问与反馈]
  Stream --> Evidence[回答、题目、工具结果与决策证据]
  Evidence --> Report[报告与改进建议]
  Evidence --> Lab[AgentLab Run / Trace / Evaluation]
  Lab --> Improve[版本评测、审计与持续优化]
  Improve --> Interview
```

产品不得把模型输出、工具调用或 Trace 本身当作用户价值。用户价值是“基于真实岗位约束得到可信、连续、可解释的面试体验”。

## 3. 默认核心架构

```mermaid
flowchart TB
  Web[React Web\n候选人面试端 / 管理端 / AgentLab] -->|JWT REST + POST SSE| API[NestJS API]

  subgraph Runtime["默认产品运行时"]
    API --> Auth[鉴权、RBAC、资源归属]
    API --> Interview[面试工作流\n简历、题目、任务队列、报告]
    Interview --> Agent[InterviewAgentService]
    Agent --> Graph[LangGraph\nSupervisor / Planner / Executor / Reviewer]
    Graph --> Tools[MCP Registry / ToolRunner]
    Agent --> Gateway[LLM Gateway\n路由、缓存、熔断、成本]
  end

  subgraph State["状态、检索与审计"]
    API --> PG[(PostgreSQL\n业务数据、Checkpoint、Run、Trace)]
    API --> Redis[(Redis\n会话、缓存、HITL)]
    Interview --> RAG[RAG\nDense + BM25 + RRF + Rerank]
    RAG --> Milvus[(Milvus)]
    RAG --> Qdrant[(Qdrant)]
    Agent --> Memory[Mem0 / 长期记忆]
    API --> Lab[AgentLab\nVersion / Run / Trace / Evaluation]
  end

  Gateway --> Qwen[Qwen 主模型]
  Gateway -.受健康状态约束的降级.-> Fallback[备用 Provider]
  Graph -->|token / tool / heartbeat / done| Web
```

### 3.1 默认路径

1. React Web 是候选人和管理员的产品入口；NestJS `apps/api` 是唯一默认产品后端。
2. 面试主链路由 `InterviewAgentService` 统一进入；默认使用 LangGraph 多 Agent，DeepAgents 和直接 LLM 仅作为显式可配置的降级路径。
3. Interview Agent 的岗位、职级、当前题目和题库范围必须作为运行时上下文进入 Agent 图。不得仅靠用户输入“开始面试”推测岗位，也不得把 AI Agent 岗位降级为通用前端题。
4. AgentLab 通过 Application、Run 和追加式 Trace 旁路接入现有面试流程；在未完成等价验收前，不得替换已稳定的 Interview API。

## 4. 不可破坏的产品规则

### 4.1 面试体验

- 一次用户发送对应一个独立请求生命周期。旧请求的超时、取消或结束事件不得影响后一轮。
- SSE 的 60 秒保护仅衡量成功建立 SSE 后的无事件时长。建连、鉴权和后端准备时间不计入。
- API 建连后立即发送心跳，并在长任务期间持续发送；前端心跳只维持连接，不写入对话或思考记录。
- 无论完成、错误、取消、断流或异常响应，前端都必须终结 streaming 状态并恢复输入与发送能力。
- `Enter` 用于多行回答，`Cmd/Ctrl + Enter` 用于发送；发送按钮始终提供可见的替代操作。
- 任何非关键侧栏、遥测或工具元数据异常不得使面试主页面崩溃。

### 4.2 面试质量

- 每轮只提出一个清晰问题；追问必须指向候选人上一轮回答的具体薄弱点。
- 出题、评分和报告必须带岗位、职级、题库与简历上下文；无上下文时应明确降级，不得编造个性化判断。
- 动态题目、评分记录和报告必须可关联到同一面试、题目版本及 Agent 版本。
- 生成报告应读取结构化答题历史，而非仅从聊天顺序猜测问答角色。

### 4.3 安全与数据边界

- 所有业务接口默认要求 JWT、角色校验和资源归属校验；前端隐藏不构成授权。
- ToolRunner 默认拒绝。工具调用必须经过可审计的 `tool.call` 与唯一 `tool.result`，审批缺失、超时或异常不能放行。
- 候选人数据发送给外部模型、记忆或可观测服务前，必须具备可配置开关和隐私评估；生产 Trace 需支持脱敏与保留策略。
- 数据库升级只使用版本化 Prisma migration；迁移失败时 API 不得接收流量。

### 4.4 可解释与可评测

- TraceEvent 采用追加式、顺序化契约，保留运行、轮次、步骤、调用与终态，不覆盖历史。
- AgentLab 评测优先采用确定性规则和版本化数据集；LLM Judge 只能作为补充信号，不能成为唯一质量契约。
- 关键决策应逐步沉淀为“决策 - 证据 - 结果”关系：例如追问、评分、HITL 审批和报告建议都可回溯其输入、规则与版本。

## 5. 当前阶段与演进边界

### 当前：产品 Beta + AgentLab Alpha

已具备面试闭环、简历/RAG、动态任务队列、LangGraph、多模型网关、HITL、报告、Docker 部署，以及 AgentLab 的 Agent/版本、Run/Trace、子 Run、确定性评测和 ToolRunner 契约。

当前不把以下能力宣称为已完成：远程隔离 Worker、队列调度与自动重试、SSE 事件 offset 续传、LLM Judge、可视化版本编辑、完整企业身份体系、多租户图谱或全量知识图基础设施。

### 下一阶段的优先级

1. **可靠性**：SSE event offset/续传、请求级 Provider 重试与恢复、面试状态机端到端回归。
2. **可解释性**：在 PostgreSQL 中落地轻量 `DecisionRecord` / `DecisionEvidence`，先服务评分依据与报告追溯。
3. **评测与发布**：Golden Dataset、批量导入、版本门禁与回归比较。
4. **受控执行**：将 Interview/MCP 调用逐步纳入 ToolRunner，并接入真正隔离的 Worker。
5. **企业化**：SSO/OAuth、令牌轮转、审计导出、数据保留/脱敏、备份与容量治理。

## 6. 架构决策准则

- 优先增强现有 NestJS、PostgreSQL、Redis、Milvus/Qdrant 与 LangGraph 主路径；新组件必须解决可量化问题。
- 不以“更多 Agent”“更多数据库”作为能力目标。新增编排或存储必须改善质量、延迟、成本、可解释性或安全性。
- 图谱、Ontology、复杂推理可作为未来的旁路决策与证据层 PoC；在真实跨实体检索需求成立前，不替换当前 RAG 和业务存储主链路。
- 每一项平台能力必须可被一个真实产品场景验证，且需有对应的可观测事件、测试和降级路径。

## 7. 修改本宪法

修改本宪法需要同时说明：

1. 改动解决的用户或业务问题。
2. 对默认产品路径、数据边界和运行时规则的影响。
3. 迁移、回滚与验收方式。

仅改变技术实现、不改变上述长期约束的变更，不需要修改本宪法。
