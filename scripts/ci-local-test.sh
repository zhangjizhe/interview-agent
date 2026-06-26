#!/usr/bin/env bash
# scripts/ci-local-test.sh · 2026-06-26
#
# 本地跑 CI ci-api.yml interface-e2e 同样的测试（避免 act 拉 17GB ubuntu image 太慢）
#
# 用法：
#   bash scripts/ci-local-test.sh                    # 默认测 api:3001（NestJS）
#   bash scripts/ci-local-test.sh py                  # 测 py-api:3002
#   bash scripts/ci-local-test.sh api --no-build      # 跳过 build
#
# 测试项目（与 .github/workflows/ci-api.yml interface-e2e 一致）：
#   1. /api/health（liveness）
#   2. /api/health/ready（readiness：postgres + redis 真连）
#   3. /api/interview/list?userId=...
#   4. /api/interview/stats?userId=...
#   5. /api/tools
#   6. /api/admin/mcp-servers
#   7. /api/knowledge-base/list
#   8. /api/interview/question-bank/list
#   9. /api/interview/upload-resume（PDF 真上传 + 解析）
#
# 退出码：0=全过，1=任一失败
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 颜色
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    GREEN=''; RED=''; YELLOW=''; NC=''
fi
log() { echo -e "${GREEN}[ci-local]${NC} $*"; }
err() { echo -e "${RED}[ci-local]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[ci-local]${NC} $*"; }

# 参数解析
TARGET="${1:-api}"
SKIP_BUILD=0
shift || true
for arg in "$@"; do
    case "$arg" in
        --no-build) SKIP_BUILD=1 ;;
        *) warn "未知参数: $arg" ;;
    esac
done

# 选 backend
case "$TARGET" in
    api)
        PORT=3001
        BACKEND_TAG="interview-agent-api"
        BACKEND_CONTAINER="interview-api"
        BACKEND_DOCKERFILE="apps/api/Dockerfile"
        HEALTH_PATH="/api/health"
        READY_PATH="/api/health/ready"
        ;;
    py)
        PORT=3002
        BACKEND_TAG="interview-agent-py-api"
        BACKEND_CONTAINER="interview-py-api"
        BACKEND_DOCKERFILE="apps/py-api/Dockerfile"
        HEALTH_PATH="/api/health"
        READY_PATH="/api/health"  # py-api 无 /ready
        ;;
    *) err "未知 target: $TARGET（用 api 或 py）"; exit 1 ;;
esac

log "目标后端: $TARGET（端口 $PORT）"

# 0. 前置检查
if ! command -v docker >/dev/null 2>&1; then
    err "❌ docker 未安装"
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    err "❌ docker daemon 未运行"
    exit 1
fi

# 1. Build（可选）
if [ "$SKIP_BUILD" = "1" ]; then
    log "1. 跳过 build（使用现有镜像 $BACKEND_TAG）"
else
    log "1. Build $BACKEND_TAG ..."
    docker build -t "$BACKEND_TAG:test" -f "$BACKEND_DOCKERFILE" "$PROJECT_ROOT"
fi

# 2. 起基础设施（如未起）
log "2. 检查基础设施（postgres + redis + milvus）"
if ! docker ps --format "{{.Names}}" | grep -q "interview-postgres.*Up\|interview-postgres.*healthy"; then
    log "  启动 postgres + redis"
    docker compose up -d postgres redis 2>&1 | tail -3 || true
    sleep 5
fi
for i in $(seq 1 30); do
    if docker exec interview-postgres pg_isready -U dev >/dev/null 2>&1 && \
       docker exec interview-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        log "  ✓ postgres + redis ready"
        break
    fi
    sleep 2
done

# 3. 跑 backend 容器（端口暴露）
log "3. 启动 $BACKEND_CONTAINER（端口 $PORT）"
docker rm -f "$BACKEND_CONTAINER" 2>/dev/null || true
docker run -d \
    --name "$BACKEND_CONTAINER" \
    -p "$PORT:$PORT" \
    -e DATABASE_URL=postgresql://dev:dev123@host.docker.internal:5432/interview \
    -e REDIS_URL=redis://host.docker.internal:6379 \
    -e QDRANT_URL=http://host.docker.internal:6333 \
    -e MILVUS_URL=http://host.docker.internal:19530 \
    -e QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 \
    -e QWEN_MODEL=qwen-plus \
    -e QWEN_API_KEY=sk-test-placeholder \
    -e DEEPSEEK_API_KEY=sk-test-placeholder \
    -e JWT_SECRET=ci_test_secret_at_least_32_characters_long_xxxxxxxx \
    -e PORT="$PORT" \
    -e NODE_ENV=production \
    "$BACKEND_TAG:test"

# 4. 等 healthy
log "4. 等 backend healthy（最多 60s）"
for i in $(seq 1 60); do
    if curl -sf "http://localhost:$PORT$HEALTH_PATH" >/dev/null 2>&1; then
        log "  ✓ $BACKEND_CONTAINER healthy（${i}s）"
        break
    fi
    sleep 2
done

if ! curl -sf "http://localhost:$PORT$HEALTH_PATH" >/dev/null 2>&1; then
    err "❌ $BACKEND_CONTAINER 60s 内未 healthy"
    docker logs "$BACKEND_CONTAINER" 2>&1 | tail -30
    exit 1
fi

# 5. E2E 接口测试
log "5. E2E 接口测试（9 个 endpoint）"
FAIL=0

check() {
    local name="$1"
    local url="$2"
    local extra="${3:-}"
    if eval "curl -sf $extra '$url' >/dev/null"; then
        log "  ✓ $name"
    else
        err "  ✗ $name"
        FAIL=$((FAIL+1))
    fi
}

check "1. Liveness ($HEALTH_PATH)" "http://localhost:$PORT$HEALTH_PATH"

# 2. Readiness（如果是 NestJS）
if [ "$READY_PATH" != "$HEALTH_PATH" ]; then
    log "  2. Readiness ($READY_PATH)"
    READY=$(curl -sf "http://localhost:$PORT$READY_PATH" || echo "{}")
    if echo "$READY" | grep -q '"status":"ready"' && \
       echo "$READY" | grep -q '"postgres":"ok"' && \
       echo "$READY" | grep -q '"redis":"ok"'; then
        log "    ✓ readiness OK"
    else
        err "    ✗ readiness FAIL: $READY"
        FAIL=$((FAIL+1))
    fi
else
    log "  2. Readiness（py-api 无 /ready 端点，跳过）"
fi

check "3. /api/interview/list" "http://localhost:$PORT/api/interview/list?userId=demo-user-ci"
check "4. /api/interview/stats" "http://localhost:$PORT/api/interview/stats?userId=demo-user-ci"
check "5. /api/tools" "http://localhost:$PORT/api/tools"
check "6. /api/admin/mcp-servers" "http://localhost:$PORT/api/admin/mcp-servers"
check "7. /api/knowledge-base/list" "http://localhost:$PORT/api/knowledge-base/list"
check "8. /api/interview/question-bank/list" "http://localhost:$PORT/api/interview/question-bank/list?limit=3"

# 9. upload-resume（用真实 PDF）
log "  9. /api/interview/upload-resume"
RESUME=$(mktemp -t ci-resume-XXXXXX.pdf)
python3 -c "
from reportlab.pdfgen import canvas
c = canvas.Canvas('$RESUME')
c.drawString(50, 750, 'Name: CI Local Test')
c.drawString(50, 730, 'Email: ci-local@test.local')
c.drawString(50, 710, 'Skills: Python TypeScript NestJS FastAPI')
c.save()
" 2>/dev/null || {
    # fallback：无 reportlab，用最小有效 PDF
    cat > "$RESUME" <<'PDFEOF'
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 44>>stream
BT/F1 12 Tf
50 700 Td
(Name: CI Test Email: ci@test.local)Tj
ET
endstream endobj
xref
0 5
0000000000 65535 f
0000000010 00000 n
0000000053 00000 n
0000000096 00000 n
0000000158 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref 240
%%EOF
PDFEOF
}

UPLOAD_BODY=$(mktemp)
UPLOAD_CODE=$(curl -s -o "$UPLOAD_BODY" -w "%{http_code}" -X POST "http://localhost:$PORT/api/interview/upload-resume" \
    -F "file=@$RESUME" \
    -F "position=AI Agent" \
    -F "userId=demo-user-ci" 2>&1)
if { [ "$UPLOAD_CODE" = "200" ] || [ "$UPLOAD_CODE" = "201" ]; } && grep -q "standardQuestions" "$UPLOAD_BODY"; then
    log "    ✓ upload-resume $UPLOAD_CODE + standardQuestions"
else
    err "    ✗ upload-resume FAIL (status=$UPLOAD_CODE)"
    head -c 200 "$UPLOAD_BODY"
    echo
    FAIL=$((FAIL+1))
fi
rm -f "$RESUME" "$UPLOAD_BODY"

# 6. 清理
log "6. 清理"
docker rm -f "$BACKEND_CONTAINER" 2>/dev/null || true

# 7. 总结
log ""
if [ $FAIL -eq 0 ]; then
    log "🎉 全过！9 个接口 200 OK"
    exit 0
else
    err "❌ $FAIL 个失败"
    exit 1
fi