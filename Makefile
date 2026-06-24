# interview-agent-2 · 双后端 Makefile
#
# 用法：
#   make help               # 查看所有命令
#   make up-nest            # 只启动 NestJS 后端 + 基础设施
#   make up-py              # 只启动 Python 后端 + 基础设施
#   make up-both            # 同时启动两个后端（默认）
#   make down               # 全部停掉
#   make logs-nest          # 看 NestJS 日志
#   make logs-py            # 看 Python 日志
#   make rebuild-nest       # 强制 rebuild NestJS
#   make rebuild-py         # 强制 rebuild Python
#
# 双后端架构（2026-06-25）：
#   - NestJS 后端 端口 3001（apps/api/）
#   - Python 后端 端口 3002（apps/py-api/）
#   - 共享 postgres/redis/milvus/qdrant

PROFILES_NEST := --profile nest
PROFILES_PY   := --profile py
PROFILES_BOTH := --profile both

.PHONY: help up up-nest up-py up-both down \
        logs logs-nest logs-py logs-web \
        rebuild rebuild-nest rebuild-py \
        status health push-branch clean

help:
	@echo "📦 interview-agent-2 · 双后端命令清单"
	@echo ""
	@echo "启动："
	@echo "  make up-nest      只启动 NestJS 后端（端口 3001）"
	@echo "  make up-py        只启动 Python 后端（端口 3002）"
	@echo "  make up-both      双后端并行（默认）"
	@echo ""
	@echo "停止："
	@echo "  make down         全部停掉"
	@echo ""
	@echo "日志："
	@echo "  make logs-nest    NestJS 日志"
	@echo "  make logs-py      Python 日志"
	@echo "  make logs-web     前端日志"
	@echo ""
	@echo "重建："
	@echo "  make rebuild-nest 强制 rebuild NestJS"
	@echo "  make rebuild-py   强制 rebuild Python"
	@echo ""
	@echo "其他："
	@echo "  make status       容器状态"
	@echo "  make health       健康检查"
	@echo "  make push-branch  推送到新分支"
	@echo "  make clean        清理所有容器+卷"

# ============ 启动 ============

up-nest:
	docker compose $(PROFILES_NEST) up -d
	@echo ""
	@echo "✅ NestJS 后端已启动：http://localhost:3001"

up-py:
	docker compose $(PROFILES_PY) up -d
	@echo ""
	@echo "✅ Python 后端已启动：http://localhost:3002"

up-both:
	docker compose $(PROFILES_BOTH) up -d
	@echo ""
	@echo "✅ 双后端已启动："
	@echo "  - NestJS: http://localhost:3001"
	@echo "  - Python:  http://localhost:3002"

# 默认 up = up-both
up: up-both

# ============ 停止 ============

down:
	docker compose --profile nest --profile py --profile both down
	@echo "✅ 全部停止"

# ============ 日志 ============

logs-nest:
	docker logs -f interview-api

logs-py:
	docker logs -f interview-py-api

logs-web:
	docker logs -f interview-web

logs: logs-nest logs-py logs-web

# ============ 重建 ============

rebuild-nest:
	docker compose $(PROFILES_BOTH) build --no-cache api
	docker compose $(PROFILES_BOTH) up -d api

rebuild-py:
	docker compose $(PROFILES_BOTH) build --no-cache py-api
	docker compose $(PROFILES_BOTH) up -d py-api

rebuild: rebuild-nest rebuild-py

# ============ 状态 ============

status:
	docker compose $(PROFILES_BOTH) ps

health:
	@echo "🏥 NestJS (3001):"
	@curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3001/api/health || echo "  ❌ down"
	@echo ""
	@echo "🐍 Python (3002):"
	@curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3002/api/health || echo "  ❌ down"
	@echo ""
	@echo "🌐 Web (5173):"
	@curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:5173/ || echo "  ❌ down"

# ============ Git 推送 ============

push-branch:
	@echo "📤 推送到新分支 feat/dual-backend-2026-06..."
	git checkout -b feat/dual-backend-2026-06
	git add apps/py-api/ docker-compose.yml Makefile
	git commit -m "feat: 双后端架构（NestJS + Python FastAPI 并行）

- 新增 apps/py-api/（FastAPI + LangGraph 0.5 + 4 层记忆）
- docker-compose profiles：nest / py / both 三种模式
- Makefile 封装启动 / 重建 / 日志命令
- 双后端共享 postgres / redis / milvus / qdrant"
	git push -u origin feat/dual-backend-2026-06
	@echo ""
	@echo "✅ 分支已推送：feat/dual-backend-2026-06"

# ============ 清理 ============

clean:
	docker compose --profile nest --profile py --profile both down -v
	@echo "✅ 全部清理完成"