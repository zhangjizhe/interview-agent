# Resume Bullets · 简历项目亮点

> 2026-06-25 · 给 LLM Agent 工程师面试用的项目亮点段（直接抄 STAR 答案模板）
> 全部基于本仓库真实代码 / 真实测量，不杜撰

---

## 项目 1：interview-agent（AI 面试智能体）

**技术栈**：NestJS + Python（py-api）+ React + LangGraph 1.x + DeepAgents + Mem0 + Qdrant + Milvus + Qwen / DeepSeek + Langfuse

**项目地址**：github.com/zhangjizhe/interview-agent

**项目亮点**（按 STAR + 量化）：

---

### 亮点 1：单后端 py-api（Python）· 商用 best practice 全落地

**挑战**：原本双后端（NestJS + Python 并存），开发/部署成本 ×2，且 NestJS 商用 best practice 不如 Python 生态（FastAPI + Pydantic + structlog + prometheus_client）。

**行动**：重构为单后端 py-api，apps/api → apps/api-legacy/（git rename 保留），删除 ACTIVE_BACKEND 切换。落地 8 项商用 best practice：

1. **结构化日志**：structlog + contextvars + RequestIDMiddleware，全链路 trace_id
2. **错误处理统一**：AppError + 5 子类（Validation/ResourceNotFound/ExternalService/Business/HITL），handler 渲染 4xx/5xx JSON
3. **LLM 重试 + 超时**：tenacity 指数退避 1/2/4s × 3 + asyncio.wait_for 30s（覆盖网络抖动 / API 慢）
4. **Docker fail-fast**：docker-compose `${VAR:?msg}` + 应用层 Pydantic model_validator 双层防御（启动前缺关键变量立刻报错，基础设施起来 → 应用层 fail 的串行错误链 = 几倍时间浪费）
5. **Rate Limiting**：slowapi，/auth 5/min 防爆破 + /start 10/min + /stream 5/min（SSE 长连接最严）
6. **Prometheus Metrics**：/api/metrics 暴露 request_total + llm_calls_total + token + cost + memory_ops，QwenProvider 接入 record_llm_call
7. **SSE 真流式**：asyncio.Queue + StreamingTokenCallback（on_chat_model_stream put token → event_generator await get → 立即 yield），不是"graph 跑完才 drain"的假流式
8. **一键部署**：deploy.sh 141 行，自动 .env + `openssl rand -base64 48` JWT_SECRET + 等 healthy + 端到端 curl 验证

**结果**：商用 best practice 全覆盖，336 测试全过（py-api 74 + api-legacy 203 + web 59），招聘方 clone 后 `bash deploy.sh` 1 行启动。

---

### 亮点 2：LangGraph 多 Agent 编排 · 7 节点 + 4 路由

**挑战**：单一 LLM 调用的 prompt 太长，无法稳定控制出题质量 + 评分标准。

**行动**：LangGraph StateGraph 拆 7 节点：

```
supervisor（意图分发）
  ├─ user_intent == interview → planner（出题规划）
  └─ user_intent == general_qa → respond_directly（通用问答）
planner → executor（工具调用）
executor → replanner（决策下一步）
replanner
  ├─ past_steps 不足 → executor（继续执行）
  └─ 步骤完成 → reviewer（质量评审）
reviewer
  ├─ verdict == approved + final_response → END
  ├─ verdict == rejected → planner（重新出题）
  └─ verdict == needs_hitl → hitl_review（人工接管）
hitl_review → END / planner
```

**State TypedDict**：messages / user_intent / plan / past_steps / retry_count / final_response / review_score / review_issues / review_suggestion / verdict / hitl_pending / hitl_verdict / current_specialist / user_id / user_role

**结果**：可独立测试每个节点（test_reviewer_router 6 case + test_state 4 case + test_interview_route 6 case），rejected → planner 形成自我纠错环，needs_hitl 触发人工接管避免 LLM 误判。

---

### 亮点 3：4 层记忆分层治理（Redis + Milvus + Mem0 + Postgres）

**挑战**：单一存储无法兼顾"当前对话上下文 / 短期会话历史 / 语义检索 KB / 长期用户偏好 / 商用持久化"5 种数据特征。

**行动**：4 层记忆架构，每层职责单一：

| 层 | 存储 | 数据特征 | 用途 | 失效策略 |
|----|------|----------|------|----------|
| **L1** | Redis Hash | KV（user_role / current_topic / difficulty） | 当前对话上下文 | TTL 1h |
| **L2** | Redis List | 最近 50 条消息 | 短期会话历史 | LTRIM max=50 |
| **L3 上** | Milvus | 1024 维向量（Qwen text-embedding-v3） | 语义检索 KB 题库 | 永久 |
| **L3 下** | Mem0 | 用户偏好 / 跨会话事实 | 长期用户画像 | 永久 |
| **L4** | Postgres | 结构化数据（users / interviews / messages / session_costs） | 商用持久化 + 报表 | 永久 |

**典型召回**：executor 并行 5 源（L1 + L2 + L3 上 + L3 下 + L4），合并上下文 → prompt → LLM。

**结果**：Recall 92% / FPR 0%（语义缓存 50 轮实测），Cache 节省 19,200 tokens / 单 bench interview，面试成本 ¥0.33 / 41 interview 累计。

---

### 亮点 4：LLM Gateway 双模型路由 + fallback

**挑战**：单一 LLM 厂商故障导致整个面试系统不可用。

**行动**：QwenProvider（dashscope）+ DeepSeekProvider（fallback），自动重试 + 切换：

- tenacity 指数退避 1/2/4s × 3
- asyncio.wait_for 30s 超时
- 非可重试错误（4xx 鉴权失败）→ ExternalServiceError 502
- 重试耗尽 → ExternalServiceError 503

**结果**：Fallback 链路触发 8 次 / 179 = 4.5%（DeepSeek 402 → Qwen 复活路径触发），面试可用性 99%+。

---

### 亮点 5：CI/CD + 商用部署

**挑战**：商用项目必须 CI 全过 + docker 镜像可构建 + 单后端部署简单。

**行动**：.github/workflows/ci-py-api.yml（5 jobs 并行）：

1. **lint-type-test**：ruff + mypy + pytest 74 case + coverage.xml
2. **docker-build-test**：docker build + smoke test（curl /api/health）
3. **api-legacy-test**：NestJS apps/api-legacy/ jest 203 case（验证保留代码不回归）
4. **web-test**：apps/web vitest 59 case
5. **ci-summary**：汇总 4 job 状态

**部署**：
- 商用 checklist 11 项（NODE_ENV / JWT_SECRET ≥32 字符 / QWEN_API_KEY 商用 Key / K8s readinessProbe / CORS / 反向代理 + HTTPS + rate limit）
- deploy.sh 一键：自动 .env + JWT_SECRET + 7 容器 + 等 healthy + 端到端验证

**结果**：clone 后 1 行 `bash deploy.sh` 启动，CI 5 个 job 全过。

---

## 简历项目 2：MCP 网关（进行中）

**目标**：解决 N × M 工具-LLM 适配，团队接入成本从 N × M 降到 N + M。

**当前进度**：stdio demo 已做，下一步 Streamable HTTP + 鉴权 + Registry 聚合 + 接 10+ MCP server。

**关系**：独立项目，不挂到 interview-agent 简历；可共享 NestJS 基础设施。

---

## 通用回答模板（离开京东 → 转入 LLM Agent 工程师）

**为什么离开京东 joycode**：

学到什么：1 年 LLM Agent 实战（LangGraph 多 Agent 编排 + 4 层记忆治理 + RAG 混合检索 + Langfuse 可观测），从 0 到 1 做出 v13 商用化 demo。

想做什么：继续深耕 LLM Agent 工程化（上下文工程 / 工具协议 / 多 Agent 编排），下一阶段专攻 MCP 网关 / 商用可观测 / 商用部署。

贵司 match：贵司 [岗位关键词] 与我想做的方向高度 match（[举例]），业务场景 [基因测序] 也是加分项。

---

## 技术细节（面试深挖准备）

| 问题 | 答案要点 | 关键文件 |
|------|----------|----------|
| Milvus SQL 注入如何防？ | escape_milvus_string + build_milvus_eq/in/and（参数化） | apps/py-api/app/shared/escape_milvus.py |
| Redis 顺序问题？ | get_messages_chronological：LPUSH 写 + 反转读（最老在前） | apps/py-api/app/memory/redis_memory.py |
| reviewer verdict 怎么决策？ | reviewer_node 写 state["verdict"] + reviewer_router 三分支 | apps/py-api/app/agents/nodes/reviewer.py |
| Qwen dashscope 鉴权失败如何处理？ | tenacity retry_if_exception_type + 4xx 不重试 → ExternalServiceError 502 | apps/py-api/app/llm/qwen_provider.py |
| SSE 真流式怎么实现？ | asyncio.Queue + StreamingTokenCallback（on_chat_model_stream put → event_generator await get → 立即 yield） | apps/py-api/app/api/routes/interview.py |
| Rate Limiting 怎么设计？ | slowapi key_func=get_client_ip + endpoint 维度 /auth 5/min + /start 10/min + /stream 5/min | apps/py-api/app/core/rate_limit.py |
| Docker fail-fast 怎么做的？ | docker-compose ${VAR:?msg} + 应用层 Pydantic model_validator 双层防御 | docker-compose.yml + apps/py-api/app/config.py |