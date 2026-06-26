# interview-agent-2 · 双后端 Makefile（2026-06-26 NestJS 默认 + py-api 选配）
#
# 用法：
#   make help               # 查看所有命令
#   make up                 # 启动 NestJS + 基础设施（默认 · 8 容器）
#   make up-py              # 启动 NestJS + py-api（双后端 · 9 容器）
#   make down               # 全部停掉
#   make logs               # 看 NestJS 日志
#   make logs-py            # 看 py-api 日志（要 up-py 后才有效）
#   make rebuild            # 强制 rebuild api 镜像
#   make status             # 容器状态
#   make health             # 健康检查
#
# 架构（2026-06-26）：
#   - 默认后端：NestJS（apps/api/），端口 3001
#   - 选配后端：Python FastAPI（apps/py-api/），端口 3002（make up-py 启）
#   - 共享基础设施：postgres/redis/milvus/qdrant/mem0
#   - 前端：apps/web/，端口 5173

.PHONY: help up up-py down logs logs-py logs-web rebuild status health clean

help:
	@echo "📦 interview-agent-2 · 双后端命令清单（NestJS 默认 + py-api 选配）"
	@echo ""
	@echo "启动："
	@echo "  make up            启动 NestJS + 基础设施（默认 · 8 容器）"
	@echo "  make up-py         启动 NestJS + py-api（双后端 · 9 容器）"
	@echo ""
	@echo "停止："
	@echo "  make down          全部停掉"
	@echo ""
	@echo "日志："
	@echo "  make logs          NestJS api 日志（默认后端）"
	@echo "  make logs-py       py-api 日志（需先 make up-py）"
	@echo "  make logs-web      前端日志"
	@echo ""
	@echo "重建："
	@echo "  make rebuild       强制 rebuild api 镜像"
	@echo "  make rebuild-py    强制 rebuild py-api 镜像"
	@echo ""
	@echo "其他："
	@echo "  make status        容器状态"
	@echo "  make health        健康检查"
	@echo "  make clean         清理所有容器+卷"

# ============ 启动 ============

# NestJS 默认（8 容器）
up:
	docker compose up -d
	@echo ""
	@echo "✅ NestJS 已启动：http://localhost:3001"
	@echo "   前端:        http://localhost:5173"
	@echo "   API 文档:    http://localhost:3001/api/docs"

# NestJS + py-api 双后端（9 容器）
up-py:
	docker compose --profile py up -d
	@echo ""
	@echo "✅ 双后端已启动："
	@echo "   NestJS:    http://localhost:3001（默认 · web 反代）"
	@echo "   py-api:    http://localhost:3002（选配 · 需手动改 web 反代）"
	@echo "   前端:      http://localhost:5173"

# ============ 停止 ============

down:
	docker compose down
	@echo "✅ 全部停止"

# ============ 日志 ============

logs:
	docker logs -f interview-api

logs-py:
	docker logs -f interview-py-api

logs-web:
	docker logs -f interview-web

# ============ 重建 ============

rebuild:
	docker compose build --no-cache api
	docker compose up -d api

rebuild-py:
	docker compose --profile py build --no-cache py-api
	docker compose --profile py up -d py-api

# ============ 状态 ============

status:
	docker compose ps

health:
	@echo "🐟 NestJS (3001):"
	@curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3001/health || echo "  ❌ down"
	@echo ""
	@echo "🐍 Python (3002 · 选配):"
	@curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3002/api/health || echo "  ⚠️ 未启（make up-py）"
	@echo ""
	@echo "🌐 Web (5173):"
	@curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:5173/ || echo "  ❌ down"

# ============ 清理 ============

clean:
	docker compose down -v
	@echo "✅ 全部清理完成"
