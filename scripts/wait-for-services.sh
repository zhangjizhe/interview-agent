#!/usr/bin/env bash
# 等所有 docker compose 服务健康
set -e

echo "⏳ Waiting for services to be healthy..."

# 服务列表：name → healthcheck URL
declare -A SERVICES=(
  ["postgres"]="pg_isready -h localhost -p 5432 -U dev"
  ["redis"]="redis-cli -h localhost -p 6379 ping"
  ["milvus"]="curl -fsS http://localhost:9091/healthz"
  ["mem0"]="curl -fsS http://localhost:8888/api/health"
  ["api"]="curl -fsS http://localhost:3001/health"
)

MAX_WAIT=180  # 最多等 3 分钟
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  ALL_HEALTHY=true
  for svc in "${!SERVICES[@]}"; do
    cmd="${SERVICES[$svc]}"
    if ! docker exec "interview-$svc" bash -c "$cmd" > /dev/null 2>&1; then
      echo "  ⏳ $svc not ready yet"
      ALL_HEALTHY=false
    else
      echo "  ✅ $svc healthy"
    fi
  done

  if $ALL_HEALTHY; then
    echo ""
    echo "🎉 All services ready!"
    exit 0
  fi

  sleep 5
  WAITED=$((WAITED + 5))
done

echo "❌ Timeout waiting for services"
docker compose ps
exit 1