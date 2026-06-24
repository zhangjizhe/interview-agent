# apps/py-api · Python 版 FastAPI 后端

> 与 NestJS 版（`apps/api/`）**并行**运行的双后端架构，**复用同一份** postgres / redis / milvus / qdrant 数据层。

## 架构定位

| 维度 | apps/api/（NestJS） | apps/py-api/（Python） |
|---|---|---|
| 用途 | 主后端 / 简历主项目 | Python 展示 / 未来 AI 主流 |
| 框架 | NestJS 11 | FastAPI 0.115 |
| LLM | LangChain 1.x + LangGraph 1.x | LangChain 0.3 + LangGraph 0.5 |
| ORM | Prisma | SQLAlchemy 2.0 |
| 类型 | TypeScript | Python 3.11 + Pydantic 2 |
| HTTP 端口 | 3001 | 3002 |
| 多 Agent | ✅ 5 节点 | ✅ 5 节点（镜像对齐） |
| 4 层记忆 | ✅ | ✅（Redis + Milvus + Mem0 + DB） |
| HITL | ✅ | ✅（interrupt） |
| MCP | ✅ | 🚧 占位 |

## 5 节点多 Agent（镜像 NestJS）

```
START → supervisor → planner → executor → replanner → reviewer → END
                    ↘ respond_directly ↗   ↺        ↘ hitl_review → END
```

**节点职责**：
- **supervisor**：意图分类（interview vs general_qa）
- **planner**：拆解 plan（generate_question / evaluate_answer / search_knowledge）
- **executor**：执行 step（含 LLM / Milvus / Mem0 调用）
- **replanner**：判断是否需要再跑一轮
- **reviewer**：评分（approved / rejected / needs_hitl）
- **respond_directly**：general_qa 直返
- **hitl_review**：评分争议 interrupt 暂停

## 4 层记忆架构

| 层 | 实现 | 用途 |
|---|---|---|
| L1 工作记忆 | Redis Hash | 当前 interview 的临时状态 |
| L2 会话记忆 | Redis List | 最近 50 条对话 |
| L3 长期记忆 | Milvus 向量 + Mem0 语义 | 跨 interview 召回 |
| L4 用户画像 | PostgreSQL / SQLAlchemy | 用户历史档案 |

## 启动方式

### Docker Compose（一键起）

```bash
cd /Users/zhangjizhe/Desktop/interview-agent-2
docker compose up -d py-api
```

端口 `3002`，与 NestJS 版（3001）并存。

### 本地开发

```bash
cd apps/py-api
python -m venv .venv
source .venv/bin/activate
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
uvicorn app.main:app --reload --port 3002
```

## API 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/login` | JWT 登录（开发期免密） |
| POST | `/api/interview/start` | 启动多 Agent 面试（同步） |
| POST | `/api/interview/stream` | 启动多 Agent 面试（SSE 流式） |

## 环境变量

参考 `.env` 文件，必填：

```bash
QWEN_API_KEY=sk-xxx          # DashScope API Key
MEM0_API_KEY=m0-xxx           # Mem0 cloud API Key（可选）
JWT_SECRET=dev-secret         # JWT 签名密钥
```

可选：

```bash
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MILVUS_URL=http://milvus:19530
REDIS_URL=redis://redis:6379
DATABASE_URL=postgresql://dev:dev123@postgres:5432/interview
```

## 代码对照（NestJS ↔ Python）

| NestJS（apps/api/src/） | Python（apps/py-api/app/） |
|---|---|
| `agents/multi-agent/graph.ts` | `agents/graph.py` |
| `agents/multi-agent/state.ts` | `agents/state.py` |
| `agents/multi-agent/nodes/*.ts` | `agents/nodes/*.py` |
| `infra/redis/redis.service.ts` | `memory/redis_memory.py` |
| `modules/memory/long-term/milvus-memory.store.ts` | `memory/milvus_memory.py` |
| `modules/memory/long-term/mem0.store.ts` | `memory/mem0_memory.py` |
| `modules/llm/llm.gateway.service.ts` | `llm/qwen_provider.py` |
| `main.ts` | `main.py` |
| `modules/interview/interview.controller.ts` | `api/routes/interview.py` |
| `modules/auth/auth.controller.ts` | `api/routes/auth.py` |

## 简历怎么写

> **多后端架构经验**：同时维护 TypeScript（NestJS）与 Python（FastAPI）双后端，
> 共享同一份 LangGraph 5 节点多 Agent 拓扑和 4 层记忆架构。
> 在两个语言生态中证明 Agent 系统的可移植性。

## 未来计划

- [ ] LangGraph Checkpointer 集成（PostgresSaver）
- [ ] MCP 客户端（Python 版 stdio + streamable-http）
- [ ] DPO/Human-in-the-Loop 数据回流
- [ ] vLLM 本地推理支持
- [ ] Performance benchmark（vs NestJS 版）