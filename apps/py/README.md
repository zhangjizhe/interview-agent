# Interview Agent — Python 后端

> 与 NestJS 版本 (`apps/api/`) 像素级等价的 Python 实现。
> 切换分支即可切换后端部署，前端无需改一行代码。

## 当前进度

| Phase | 状态 | 内容 |
|-------|------|------|
| **P1** | ✅ | FastAPI 骨架 + Docker + 配置 + /health + CORS + /api 前缀 |
| P2 | 🚧 | SQLAlchemy + Alembic 8 表 + Redis + JWT Auth |
| P3 | 📋 | LLM Gateway 双 provider + 永久错检测 + Fallback |
| P4 | 📋 | Prompt Cache 三段 + 语义缓存 + 精确缓存 + 成本 |
| P5 | 📋 | LangGraph 1.x 7 节点 + StateGraph + Pydantic |
| P6 | 📋 | PostgresSaver checkpoint + HITL interrupt/Command |
| P7 | 📋 | 四层记忆（Redis + Mem0 + Milvus） |
| P8 | 📋 | 动态任务队列 + 5 领域题库 + AgentDecide |
| P9 | 📋 | RAG 混合检索 + ResumeRAG + Benchmark |
| P10 | 📋 | MCP Server + 3 工具 + Adapter + Registry |
| P11 | 📋 | 简历 PDF + 4 级水位线压缩 |
| P12 | 📋 | 接口测试 + UI 自动化 + E2E |

## 快速启动（Phase 1）

```bash
# 1. 装依赖
cd apps/py
pip install -e ".[dev]"

# 2. 启动基础设施（postgres / redis / qdrant）
cd ../..
pnpm infra:up

# 3. 复制 env
cp apps/py/.env.example apps/py/.env
# 编辑 .env 填 QWEN_API_KEY / DEEPSEEK_API_KEY

# 4. 启动 Python 后端
cd apps/py
python -m interview_agent.main
# 或 uvicorn interview_agent.main:app --reload --port 3001

# 5. 验证
curl http://localhost:3001/health
# { "status": "ok", "timestamp": "...", "uptime": 0.5 }

# 6. OpenAPI 文档
open http://localhost:3001/docs
```

## Docker 启动

```bash
# 在 py 分支下：docker-compose.yml 的 api 服务默认指向 apps/py/Dockerfile
docker compose up -d --build api
docker logs -f interview-api
# 看到 🚀 Interview Agent (Python) starting... + ✅ Health endpoint ready 即就绪
```

## 像素级对齐标准

| 维度 | 对齐规则 |
|------|---------|
| API 路由 | 路径 + 方法 + 请求/响应 schema 完全一致 |
| HTTP 头 | CORS / Content-Type / Authorization 处理一致 |
| SSE 流式 | `data: {json}\n\n` 格式 + chunk 顺序一致 |
| DB schema | 8 张表 + 字段 + 索引 + 约束 1:1 对齐 |
| Redis key | 命名空间 + TTL + 序列化格式一致 |
| 错误响应 | `{ "statusCode", "message", "error" }` 格式一致 |
| 日志格式 | `[时间] [级别] [模块] 消息` 风格一致 |

## 工程结构

```
apps/py/
├── pyproject.toml           # Python 项目元数据 + 依赖
├── Dockerfile               # python:3.11-slim 容器镜像
├── alembic/                 # DB schema 迁移（Phase 2）
├── alembic.ini
├── .env.example
├── README.md
├── src/
│   └── interview_agent/
│       ├── __init__.py
│       ├── main.py          # FastAPI 入口
│       ├── config.py        # pydantic-settings 配置
│       ├── deps.py          # FastAPI DI
│       ├── api/             # HTTP 路由
│       │   └── health.py    # /health endpoint
│       ├── common/          # 跨模块公共工具
│       │   └── logging.py
│       ├── infra/           # 基础设施 client（DB / Redis / Langfuse / Qdrant）
│       └── modules/         # 业务模块（对齐 NestJS modules/）
│           ├── auth/
│           ├── llm/
│           ├── agent/
│           ├── interview/
│           ├── memory/
│           ├── mcp/
│           ├── knowledge_base/
│           ├── metrics/
│           ├── user/
│           └── reflection/
└── tests/                   # pytest 测试套件（Phase 12）
```