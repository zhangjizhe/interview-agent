# P12 全套测试套件 — 与 NestJS 像素级对齐

## 覆盖范围

| Phase | Test Class | 验证内容 |
|-------|-----------|---------|
| **P1** | TestP1Health | /health, /health/ready, /, /api/health 404 |
| **P2** | TestP2Auth + TestP2User | JWT login / profile, user upsert / get / 404 |
| **P3** | TestP3LLMGateway | Provider 注册、mock chat、fallback、token estimation |
| **P4** | TestP4PromptCache + SemanticCache + CostTracker | fnv1a, classify, build context, extract usage, fingerprint, inject cache control, semantic lookup miss/blacklist, cost tracker start/record/flush/skip |
| **P5** | TestP5MultiAgent | State round-trip, supervisor, planner, reviewer (low/high), full graph run |
| **P6** | TestP6HITL | pending → approve → graph-resume 完整生命周期 |
| **P7** | TestP7Memory | L1/L2/L3 4 层记忆读写 + TTL |
| **P8** | TestP8TaskQueue | enqueue / next_pending / complete + heuristic_decide + 5 领域题库 |
| **P9** | TestP9RAG | 24 case benchmark P@5 ≥ 0.5 + recall endpoint + benchmark endpoint + ResumeRAG 倒序 |
| **P10** | TestP10MCP | 3 内置工具 + bocha mock + memory_recall + knowledge_bank + /api/tools + /api/admin/mcp toggle + disable 拦截 |
| **P11** | TestP11ResumeParser + ContextCompression | PDF 解析 + clean text + T0-T3 压缩 |
| **E2E** | TestE2EInterviewFlow | start → message (SSE) → end → cost 全链路 |

## 运行

```bash
cd apps/py
/Users/zhangjizhe/Desktop/interview-agent/apps/py/.venv/bin/python -m pytest tests/ -v
```

## 已知限制

- **LLM 真实调用**：`QWEN_API_KEY=sk-placeholder` 时全部走 Mock provider；填真 key 后自动切到真 OpenAI 兼容协议。
- **Mem0**：无 `MEM0_API_KEY` 时 L3 长期记忆走 in-process dict 兜底；填真 key 后切 Mem0 cloud。
- **Milvus**：无 Milvus 时 Qdrant 兜底；当前 Python 端只接 Qdrant + in-process，Milvus 集成可后续追加。
- **LangGraph Python**：用纯 Python state machine 实现（避免版本兼容），行为与 @langchain/langgraph 1.x 1:1 对齐（nodes + state + interrupt + resume）。
- **PG / Redis 已起来** 才跑测试（lifespan 自动连）。