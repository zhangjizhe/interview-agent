#!/usr/bin/env bash
# deploy.sh · 2026-06-26 NestJS 默认 + py-api 选配
#
# 用法：
#   bash deploy.sh                    # 启动 NestJS 默认（推荐 · 一键）
#   bash deploy.sh --py                # 同时启 py-api 选配（薄壳版）
#   bash deploy.sh --fresh             # 删 volumes 重启（清空数据）
#   bash deploy.sh --reset             # 删容器 + volumes + .env 重建
#   bash deploy.sh --stop              # 停掉所有容器
#   bash deploy.sh --logs              # tail api 日志
#
# 首次启动会自动：
#   1. cp .env.example .env（如不存在）
#   2. 生成 JWT_SECRET dev 占位（≥32 字符）
#   3. docker compose up -d --build
#
# 启动后（NestJS 默认）：
#   - 前端: http://localhost:5173
#   - 后端: http://localhost:3001（NestJS）
#   - 文档: http://localhost:3001/api/docs
#
# 选配启 py-api（薄壳版商用 best practice 后端）：
#   bash deploy.sh --py
#   - 多端口：3001 (NestJS) + 3002 (py-api)
#   - 注意：web 默认反代 api:3001，py-api 需手动改 web/nginx.conf 后重 build
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色（无 TTY 时跳过）
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    NC='\033[0m'
else
    GREEN=''; YELLOW=''; RED=''; NC=''
fi

log() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err() { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ===== 参数解析 =====
FRESH=0
RESET=0
STOP=0
LOGS=0
PY_PROFILE=0
for arg in "$@"; do
    case "$arg" in
        --fresh) FRESH=1 ;;
        --reset) RESET=1 ;;
        --stop) STOP=1 ;;
        --logs) LOGS=1 ;;
        --py) PY_PROFILE=1 ;;
        -h|--help)
            echo "用法: bash deploy.sh [--py|--fresh|--reset|--stop|--logs]"
            echo "  --py     同时启 py-api 选配（薄壳版 · 端口 3002）"
            echo "  --fresh  删 volumes 重启（清空数据）"
            echo "  --reset  删容器 + volumes + .env 重建"
            echo "  --stop   停掉所有容器"
            echo "  --logs   tail api 日志"
            exit 0
            ;;
        *) err "未知参数: $arg"; exit 1 ;;
    esac
done

# ===== 子命令 =====
if [ "$STOP" = "1" ]; then
    log "停止所有容器..."
    docker compose down
    log "✅ 已停止"
    exit 0
fi

if [ "$LOGS" = "1" ]; then
    docker logs -f interview-api
    exit 0
fi

# ===== 0. 前置检查 =====
log "0. 前置检查"
if ! command -v docker >/dev/null 2>&1; then
    err "❌ docker 未安装"
    echo "  macOS: brew install --cask docker"
    echo "  Linux: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    err "❌ docker daemon 未运行（启动 Docker Desktop / sudo systemctl start docker）"
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    err "❌ docker compose v2 未安装（升级 Docker Desktop 或装 docker-compose-plugin）"
    exit 1
fi

log "✅ docker $(docker --version | cut -d' ' -f3 | tr -d ',') + compose v$(docker compose version --short)"

# ===== 1. .env 自动生成 =====
log "1. 检查 .env"

if [ "$RESET" = "1" ] && [ -f .env ]; then
    log "  --reset：删 .env 重建"
    rm -f .env
fi

if [ ! -f .env ]; then
    if [ ! -f .env.example ]; then
        err "❌ .env.example 不存在，无法自动生成 .env"
        exit 1
    fi
    log "  cp .env.example .env"
    cp .env.example .env

    # 自动生成 JWT_SECRET dev 占位（≥32 字符）
    if command -v openssl >/dev/null 2>&1; then
        JWT_SECRET_DEV=$(openssl rand -base64 48 | tr -d '\n')
    else
        # fallback：date + uuid
        JWT_SECRET_DEV="dev-$(date +%s)-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo $RANDOM)"
    fi
    # 用 sed 替换 .env 里的 JWT_SECRET= 行
    if grep -q "^JWT_SECRET=" .env; then
        sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET_DEV}|" .env && rm -f .env.bak
    else
        echo "JWT_SECRET=${JWT_SECRET_DEV}" >> .env
    fi
    log "  ✅ 自动生成 JWT_SECRET dev 占位（≥32 字符）"
    warn "  ⚠️ 商用前必须改 .env 里的 JWT_SECRET 为商用值（openssl rand -base64 48）"
fi

# 检查 QWEN_API_KEY（即使是空也 OK，但 warn）
if ! grep -q "^QWEN_API_KEY=" .env || grep -q "^QWEN_API_KEY=$" .env; then
    warn "  ⚠️ QWEN_API_KEY 未设置 → LLM 调用会失败（但服务能启动）"
    warn "    申请：https://dashscope.aliyuncs.com/"
    warn "    编辑 .env 填入后跑：bash deploy.sh"
fi

# ===== 2. 启动 =====
if [ "$RESET" = "1" ]; then
    log "2. --reset：删容器 + volumes"
    docker compose down -v
    log "  重建 .env（上面已处理）"
fi

if [ "$FRESH" = "1" ]; then
    log "2. --fresh：删 volumes 但保留 .env"
    docker compose down -v
fi

# 决定用哪个 profile
COMPOSE_PROFILES=""
if [ "$PY_PROFILE" = "1" ]; then
    COMPOSE_PROFILES="--profile py"
    log "2. docker compose $COMPOSE_PROFILES up -d --build（NestJS + py-api 双后端）"
else
    log "2. docker compose up -d --build（NestJS 默认）"
fi
docker compose $COMPOSE_PROFILES up -d --build

# ===== 3. 等服务就绪 =====
log "3. 等服务就绪（首次 build 可能要 3-5 分钟）"
echo -n "  等待 api healthy "
for i in $(seq 1 60); do
    if docker ps --format "{{.Names}}\t{{.Status}}" | grep -q "interview-api.*healthy"; then
        echo
        log "  ✅ api healthy（${i}s）"
        break
    fi
    echo -n "."
    sleep 2
done

if ! docker ps --format "{{.Names}}\t{{.Status}}" | grep -q "interview-api.*healthy"; then
    warn "  ⚠️ api 60s 内未 healthy，查看 docker logs interview-api"
fi

# ===== 4. 端到端验证 =====
log "4. 端到端验证"
sleep 2

if curl -s -f http://localhost:3001/api/health >/dev/null 2>&1; then
    log "  ✅ NestJS /api/health OK"
else
    warn "  ⚠️ /api/health 失败"
fi

if curl -s -f http://localhost:3001/api/health/ready >/dev/null 2>&1; then
    log "  ✅ NestJS /api/health/ready OK（依赖都连上）"
else
    warn "  ⚠️ /api/health/ready 失败（NestJS 无 readiness 端点，跳过）"
fi

if [ "$PY_PROFILE" = "1" ]; then
    if curl -s -f http://localhost:3002/api/health >/dev/null 2>&1; then
        log "  ✅ py-api /api/health OK（选配）"
    else
        warn "  ⚠️ py-api 选配未启（端口 3002 无响应）"
    fi
fi

# ===== 5. 总结 =====
log ""
log "🎉 部署完成！"
log ""
log "服务地址："
log "  前端:        http://localhost:5173"
log "  NestJS 后端: http://localhost:3001（默认）"
log "  API 文档:    http://localhost:3001/api/docs"
if [ "$PY_PROFILE" = "1" ]; then
    log "  py-api:    http://localhost:3002（选配 · 需手动改 web 反代）"
fi
log "  容器状态:    docker compose ps"
log "  查看日志:    bash deploy.sh --logs"
log "  停掉:        bash deploy.sh --stop"
log "  清空数据重启: bash deploy.sh --fresh"
log "  启 py-api:   bash deploy.sh --py"
log ""
log "下一步："
log "  1. 编辑 .env 填 QWEN_API_KEY（必须，否则 LLM 跑不起来）"
log "  2. 跑 bash deploy.sh 重启加载新 env"
log "  3. 访问前端 http://localhost:5173 开始面试"
log "  4. 商用前改 .env 的 JWT_SECRET 为 openssl rand -base64 48 生成值"
