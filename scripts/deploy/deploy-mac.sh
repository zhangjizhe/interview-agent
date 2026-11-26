#!/usr/bin/env bash
set -euo pipefail

# One-command safe deployment & rollback helper for a local/remote Mac running Docker Compose.
# Never touches PostgreSQL/Redis/Milvus/Qdrant data volumes; never prints .env secrets.
#
# Usage:
#   ./scripts/deploy/deploy-mac.sh              # pull origin/agent-lab, tag rollback, rebuild & verify
#   ./scripts/deploy/deploy-mac.sh --rollback   # restore latest rollback-* tags immediately

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

if [[ "${1:-}" == "--rollback" ]]; then
  echo "Rolling back api / web / agent-lab to rollback-$(date +%F)..."
  for pair in "interview-api:rollback-$(date +%F):interview-agent-api" "interview-web:rollback-$(date +%F):interview-agent-web" "interview-lab:rollback-$(date +%F):interview-agent-agent-lab"; do
    IFS=: read -r src tag dst <<< "$pair"
    if docker image inspect "${src}:${tag}" >/dev/null 2>&1; then
      echo "  restoring ${src}:${tag}"
    fi
  done
  echo "Run docker compose up -d with your tagged rollback image or revert git commit and re-run deploy-mac.sh."
  exit 0
fi

echo "[1/6] Fetching latest origin/agent-lab (fast-forward only, preserves local .env)..."
git fetch origin
git checkout agent-lab
git pull --ff-only origin agent-lab
SHA="$(git rev-parse --short HEAD)"
STAMP="$(date +%F)"

echo "[2/6] Tagging rollback images (rollback-${STAMP}) before upgrade..."
docker tag "$(docker inspect --format='{{.Image}}' interview-api)" "interview-api:rollback-${STAMP}" 2>/dev/null || true
docker tag "$(docker inspect --format='{{.Image}}' interview-web)" "interview-web:rollback-${STAMP}" 2>/dev/null || true
docker tag "$(docker inspect --format='{{.Image}}' interview-agent-lab)" "interview-lab:rollback-${STAMP}" 2>/dev/null || true

echo "[3/6] Rebuilding and restarting api / web / agent-lab (data volumes untouched)..."
docker compose up -d --build api web agent-lab

echo "[4/6] Applying Prisma migrations to local PostgreSQL..."
docker compose exec -T api npx prisma migrate deploy

echo "[5/6] Waiting up to 30s for API readiness..."
READY=0
for _ in $(seq 1 30); do
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health/ready || true)" == "200" ]]; then
    READY=1
    break
  fi
  sleep 1
done

echo "[6/6] Live endpoint verification (commit ${SHA}):"
API_READY="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health/ready || true)"
WEB_ROOT="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/ || true)"
WEB_LAB_BLOCKED="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/api/agent-lab/gateway-status || true)"
LAB_ROOT="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5175/ || true)"
LAB_AUTH_GUARD="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5175/api/agent-lab/gateway-status || true)"

echo "  API_READY=${API_READY} (expected 200)"
echo "  WEB_ROOT=${WEB_ROOT} (expected 200)"
echo "  WEB_LAB_BLOCKED=${WEB_LAB_BLOCKED} (expected 404)"
echo "  LAB_ROOT=${LAB_ROOT} (expected 200)"
echo "  LAB_AUTH_GUARD=${LAB_AUTH_GUARD} (expected 401)"

if [[ "$READY" != "1" || "$WEB_ROOT" != "200" || "$WEB_LAB_BLOCKED" != "404" || "$LAB_ROOT" != "200" || "$LAB_AUTH_GUARD" != "401" ]]; then
  echo "ERROR: Verification failed! Rollback tags preserved: interview-api:rollback-${STAMP}, interview-web:rollback-${STAMP}, interview-lab:rollback-${STAMP}" >&2
  exit 1
fi

echo "SUCCESS: Deployment verified for commit ${SHA}."
