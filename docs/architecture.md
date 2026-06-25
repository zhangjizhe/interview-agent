# Architecture · 多 Agent + 4 层记忆

> 2026-06-25 · 单后端 py-api（Python）· LangGraph StateGraph + 4 层记忆分层治理

## 系统架构总览

```mermaid
graph TB
    subgraph Client["客户端"]
        WEB["Web 前端<br/>React + Vite<br/>:5173"]
    end

    subgraph Backend["py-api · FastAPI :3002"]
        AUTH["Auth Router<br/>JWT 鉴权"]
        INTERVIEW["Interview Router<br/>流式 SSE + 同步"]
        HEALTH["Health Router<br/>liveness + readiness"]
        METRICS["Metrics Router<br/>/api/metrics"]

        subgraph Graph["LangGraph StateGraph"]
            SUP["supervisor<br/>意图分发"]
            PLAN["planner<br/>出题规划"]
            EXE["executor<br/>工具调用"]
            REPLAN["replanner<br/>决策下一步"]
            REV["reviewer<br/>质量评审"]
            HITL["hitl_review<br/>人工接管"]
            RESP["respond_directly<br/>通用问答"]
        end

        subgraph LLM["LLM Gateway"]
            QWEN["QwenProvider<br/>dashscope"]
            DS["DeepSeekProvider<br/>fallback"]
        end

        subgraph Memory["4 层记忆"]
            L1["L1 工作记忆<br/>Redis Hash"]
            L2["L2 会话记忆<br/>Redis List"]
            L3A["L3 上半<br/>Milvus 向量"]
            L3B["L3 下半<br/>Mem0 长期"]
            L4["L4 持久化<br/>Postgres ORM"]
        end
    end

    subgraph Infra["基础设施"]
        PG[("Postgres :5432")]
        RDS[("Redis :6379")]
        QDR[("Qdrant :6333")]
        MLV[("Milvus :19530")]
        MEM[("Mem0 :8888")]
    end

    WEB -->|"HTTPS SSE"| INTERVIEW
    WEB -->|"JWT"| AUTH
    K8S["K8s Probe"] -->|"GET"| HEALTH
    PROM["Prometheus"] -->|"scrape 15s"| METRICS

    INTERVIEW --> Graph
    AUTH --> L4

    Graph --> LLM
    Graph --> Memory

    L1 --> RDS
    L2 --> RDS
    L3A --> MLV
    L3B --> MEM
    L4 --> PG

    style SUP fill:#e1f5ff
    style PLAN fill:#e1f5ff
    style EXE fill:#e1f5ff
    style REPLAN fill:#e1f5ff
    style REV fill:#fff4e1
    style HITL fill:#ffe1e1
    style RESP fill:#e1ffe1
    style L1 fill:#fff0e1
    style L2 fill:#fff0e1
    style L3A fill:#fff0e1
    style L3B fill:#fff0e1
    style L4 fill:#fff0e1
```

---

## LangGraph StateGraph · 7 节点 + 4 路由

```mermaid
graph LR
    START([START]) --> SUP[supervisor]
    SUP -->|"user_intent == interview"| PLAN[planner]
    SUP -->|"user_intent == general_qa"| RESP[respond_directly]
    PLAN --> EXE[executor]
    EXE --> REPLAN[replanner]
    REPLAN -->|"past_steps 不足"| EXE
    REPLAN -->|"步骤完成"| REV[reviewer]
    REV -->|"verdict == approved<br/>+ final_response"| END1([END])
    REV -->|"verdict == rejected"| PLAN
    REV -->|"verdict == needs_hitl"| HITL[hitl_review]
    HITL -->|"hitl_verdict == approved<br/>+ final_response"| END2([END])
    HITL -->|"hitl_verdict == rejected"| PLAN
    RESP --> END3([END])

    style SUP fill:#e1f5ff
    style PLAN fill:#e1f5ff
    style EXE fill:#e1f5ff
    style REPLAN fill:#e1f5ff
    style REV fill:#fff4e1
    style HITL fill:#ffe1e1
    style RESP fill:#e1ffe1
```

### 节点职责

| 节点 | 职责 | 输出 |
|------|------|------|
| **supervisor** | 意图识别（interview vs general_qa） | `user_intent` |
| **planner** | 出题规划（基于 `user_role` 岗位匹配） | `plan: List[dict]` |
| **executor** | 工具调用（KB 检索 / LLM 调用 / Mem0 召回） | `past_steps` |
| **replanner** | 决策下一步（继续执行 vs 进入评审） | `retry_count++` |
| **reviewer** | 质量评审（LLM as a judge） | `verdict: approved/rejected/needs_hitl` |
| **hitl_review** | 人工接管（HITL 审核） | `hitl_verdict` |
| **respond_directly** | 通用问答（不走出题流程） | `final_response` |

### State 字段

```python
class InterviewState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    user_intent: Optional[Literal["interview", "general_qa"]]
    plan: Optional[List[dict]]                          # planner 输出
    past_steps: Annotated[List[dict], lambda x, y: x + y]  # executor 累积
    retry_count: int
    final_response: Optional[str]                       # reviewer approved 后填
    review_score: Optional[float]
    review_issues: Optional[List[str]]
    review_suggestion: Optional[str]
    verdict: Optional[Literal["approved", "rejected", "needs_hitl"]]
    hitl_pending: bool
    hitl_verdict: Optional[Literal["approved", "rejected"]]
    current_specialist: Optional[str]
    user_id: Optional[str]
    user_role: Optional[str]
```

---

## 4 层记忆架构

```mermaid
graph TB
    subgraph App["业务代码（Graph nodes）"]
        G[Graph nodes]
    end

    subgraph L1["L1 工作记忆 · Redis Hash"]
        L1D["interview:{session_id}:working<br/>KV 字段：<br/>- user_role<br/>- current_topic<br/>- difficulty<br/>TTL = 1h"]
    end

    subgraph L2["L2 会话记忆 · Redis List"]
        L2D["interview:{session_id}:messages<br/>LPUSH + LTRIM max=50<br/>最近 50 条消息"]
    end

    subgraph L3A["L3 上半 · Milvus 向量"]
        L3AD["collection: interview_kb<br/>- id (PK)<br/>- topic<br/>- body<br/>- embedding (dim=1024)<br/>- metadata<br/>ANN 检索 top_k=5"]
    end

    subgraph L3B["L3 下半 · Mem0 长期"]
        L3BD["memories<br/>- user_id<br/>- memory (偏好/事实)<br/>- embedding<br/>语义检索 + add"]
    end

    subgraph L4["L4 持久化 · Postgres ORM"]
        L4D["- users<br/>- interviews<br/>- messages<br/>- session_costs<br/>SQLAlchemy 事务"]
    end

    G -->|"set / get"| L1
    G -->|"append / trim"| L2
    G -->|"search / insert"| L3A
    G -->|"search / memorize"| L3B
    G -->|"CRUD"| L4

    style L1 fill:#fff0e1
    style L2 fill:#fff0e1
    style L3A fill:#fff0e1
    style L3B fill:#fff0e1
    style L4 fill:#fff0e1
```

### 各层职责

| 层 | 存储 | 数据特征 | 用途 | 失效策略 |
|----|------|----------|------|----------|
| **L1** | Redis Hash | KV（user_role / current_topic） | 当前对话上下文 | TTL 1h |
| **L2** | Redis List | 最近 50 条消息 | 短期会话历史 | LTRIM max=50 |
| **L3 上** | Milvus | 1024 维向量（Qwen text-embedding-v3） | 语义检索 KB 题库 | 永久（KB 重新导入） |
| **L3 下** | Mem0 | 用户偏好 / 跨会话事实 | 长期用户画像 | 永久（用户主动删除） |
| **L4** | Postgres | 结构化数据（用户/面试/成本/消息） | 商用持久化 + 报表 | 永久（合规备份） |

### 召回策略（典型场景）

```
用户提问
  ↓
supervisor → planner → executor
  ↓
executor 并行召回：
  ① L1 working state → 当前 role/topic
  ② L2 messages → 最近 5 轮对话
  ③ L3 上 Milvus → KB 题库 top-5（按 query 向量）
  ④ L3 下 Mem0 → 用户偏好 top-3
  ⑤ L4 Postgres → 历史 interview 摘要
  ↓
合并上下文 → prompt → LLM → 出题 / 追问
```

---

## SSE 真流式（2026-06-26）

```mermaid
sequenceDiagram
    participant Client
    participant FastAPI
    participant Queue as asyncio.Queue
    participant Callback as StreamingTokenCallback
    participant Graph as LangGraph
    participant LLM as Qwen

    Client->>FastAPI: POST /api/interview/stream
    FastAPI->>Graph: astream(values)
    activate Graph
    Graph->>Callback: register handler
    Callback->>Queue: create (maxsize=100)
    par graph_task
        Graph->>LLM: chat (stream)
        LLM-->>Callback: token1
        Callback->>Queue: put token1
        LLM-->>Callback: token2
        Callback->>Queue: put token2
        LLM-->>Callback: ...
        Callback->>Queue: put ... (sentinel None)
    and event_generator
        Queue-->>FastAPI: await get() → token1
        FastAPI-->>Client: data: {"type":"token","content":"token1"}
        Queue-->>FastAPI: await get() → token2
        FastAPI-->>Client: data: {"type":"token","content":"token2"}
        Queue-->>FastAPI: await get() → None
        FastAPI-->>Client: data: [DONE]
    end
    deactivate Graph
```

**关键**：asyncio.Queue 是 async-safe，AsyncCallbackHandler 是 async，可以直接 await put/get。真·流式（LLM 生成一个 token → CallbackHandler 触发 → queue.put → event_generator await → yield → 客户端 SSE 立即收到）。

---

## 商用 best practice 落地（2026-06-26）

| 模块 | 实现 | 触发场景 |
|------|------|----------|
| **结构化日志** | structlog + contextvars + RequestIDMiddleware | 全链路 trace_id |
| **错误处理统一** | AppError + 5 子类（Validation/ResourceNotFound/ExternalService/Business/HITL） | 4xx/5xx JSON |
| **LLM 重试 + 超时** | tenacity 指数退避 1/2/4s × 3 + asyncio.wait_for 30s | 网络抖动 / API 慢 |
| **Docker fail-fast** | docker-compose `${VAR:?msg}` + 应用层 Pydantic model_validator | 启动前缺关键变量 |
| **Rate Limiting** | slowapi：/auth 5/min + /start 10/min + /stream 5/min | 防爆破 / 防占用 |
| **Prometheus Metrics** | /api/metrics：request_total + llm_calls_total + token + cost | Grafana 监控 |
| **SSE 真流式** | asyncio.Queue + StreamingTokenCallback | 边生成边推 |
| **一键部署** | deploy.sh：自动 .env + JWT_SECRET + 等 healthy + 端到端验证 | clone 后 1 行启动 |

---

## 文件结构

```
apps/py-api/
├── app/
│   ├── main.py                     # FastAPI app + lifespan + middleware
│   ├── config.py                   # Pydantic Settings（JWT_SECRET fail-fast）
│   ├── agents/
│   │   ├── graph.py                # LangGraph StateGraph 7 节点
│   │   ├── state.py                # InterviewState TypedDict
│   │   └── nodes/                  # supervisor/planner/executor/replanner/reviewer/hitl/respond
│   ├── llm/
│   │   ├── qwen_provider.py        # dashscope + tenacity + asyncio.wait_for
│   │   └── deepseek_provider.py    # fallback
│   ├── memory/
│   │   ├── redis_memory.py         # L1 工作 + L2 会话
│   │   ├── milvus_memory.py        # L3 上半 向量
│   │   └── mem0_memory.py          # L3 下半 长期
│   ├── db/
│   │   ├── models.py               # L4 SQLAlchemy ORM
│   │   └── session.py              # engine + session factory
│   ├── api/routes/
│   │   ├── auth.py                 # JWT login
│   │   ├── interview.py            # /start (sync) + /stream (SSE 真流式)
│   │   ├── health.py               # liveness + readiness
│   │   └── metrics.py              # /api/metrics (Prometheus)
│   └── core/
│       ├── middleware.py           # RequestIDMiddleware
│       ├── exceptions.py           # AppError + 5 子类
│       ├── rate_limit.py           # slowapi
│       └── metrics.py              # prometheus_client
├── tests/                          # 74 case（9 文件 + conftest + pytest.ini）
├── requirements.txt                # 38 依赖（langchain 0.3.27 / langgraph 0.5.4）
├── Dockerfile                      # 多阶段 + non-root USER
└── pytest.ini                      # asyncio_mode=auto
```