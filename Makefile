# interview-agent-2 · 单后端 Makefile（2026-06-26 架构简化）
#
# 用法：
#   make help               # 查看所有命令
#   make up                 # 启动 py-api（默认）
#   make down               # 全部停掉
#   make logs               # 看后端日志
#   make rebuild            # 强制 rebuild py-api
#   make status             # 容器状态
#   make health             # 健康检查
#
# 架构（2026-06-26）：
#   - 唯一后端：Python FastAPI（apps/py-api/），端口 3002
#   - NestJS api → apps/api-legacy/（保留作为参考 / 备份，不再被 docker compose 启动）
#   - 共享基础设施：postgres/redis/milvus/qdrant
#   - 前端：apps/web/，端口 5173

.PHONY: help up down logs rebuild status health clean

help:
	@echo "📦 interview-agent-2 · 单后端命令清单（py-api 唯一后端）"
	@echo ""
	@echo "启动："
	@echo "  make up            启动 py-api + 基础设施（默认）"
	@echo ""
	@echo "停止："
	@echo "  make down          全部停掉"
	@echo ""
	@echo "日志："
	@echo "  make logs          py-api 日志"
	@echo "  make logs-web      前端日志"
	@echo ""
	@echo "重建："
	@echo "  make rebuild       强制 rebuild py-api 镜像"
	@echo ""
	@echo "其他："
	@echo "  make status        容器状态"
	@echo "  make health        健康检查"
	@echo "  make clean         清理所有容器+卷"

# ============ 启动 ============

# 单后端：py-api（2026-06-26 架构简化后唯一后端）
up:
	docker compose --profile py up -d
	@echo ""
	@echo "✅ py-api 已启动：http://localhost:3002"

# ============ 停止 ============

down:
	docker compose down
	@echo "✅ 全部停止"

# ============ 日志 ============

logs:
	docker logs -f interview-py-api

logs-web:
	docker logs -f interview-web

# ============ 重建 ============

rebuild:
	docker compose --profile py build --no-cache py-api
	docker compose --profile py up -d py-api

# ============ 状态 ============

status:
	docker compose $(PROFILES_DEFAULT) ps

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