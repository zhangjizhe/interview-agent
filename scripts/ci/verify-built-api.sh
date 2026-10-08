#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
fixture_image="${1:-interview-api:verification}"
fixture_network="interview-built-check-$$"
fixture_pg="$fixture_network-pg"
fixture_redis="$fixture_network-redis"
fixture_etcd="$fixture_network-etcd"
fixture_milvus="$fixture_network-milvus"
fixture_api="$fixture_network-api"
cleanup() {
  docker rm -fv "$fixture_api" "$fixture_pg" "$fixture_redis" "$fixture_milvus" "$fixture_etcd" >/dev/null 2>&1 || true
  docker network rm "$fixture_network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# Internal Docker network blocks external providers. No host ports or real .env.
docker network create --internal "$fixture_network" >/dev/null
docker run -d --name "$fixture_pg" --network "$fixture_network" --network-alias fixture-pg -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
docker run -d --name "$fixture_redis" --network "$fixture_network" --network-alias fixture-redis redis:7-alpine >/dev/null
docker run -d --name "$fixture_etcd" --network "$fixture_network" --network-alias fixture-etcd quay.io/coreos/etcd:v3.5.5 \
  etcd -advertise-client-urls=http://fixture-etcd:2379 -listen-client-urls http://0.0.0.0:2379 --data-dir /etcd >/dev/null
docker run -d --name "$fixture_milvus" --network "$fixture_network" --network-alias fixture-milvus \
  -e ETCD_ENDPOINTS=fixture-etcd:2379 -e COMMON_STORAGETYPE=local milvusdb/milvus:v2.5.3 milvus run standalone >/dev/null
for attempt in {1..30}; do
  if docker exec "$fixture_pg" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
fixture_vector_ready=false
for attempt in {1..90}; do
  if docker exec "$fixture_milvus" curl --fail --silent http://127.0.0.1:9091/healthz >/dev/null 2>&1; then fixture_vector_ready=true; break; fi
  sleep 1
done
test "$fixture_vector_ready" = true
docker exec "$fixture_pg" createdb -U postgres fixture
docker run --rm --network "$fixture_network" -e DATABASE_URL=postgresql://postgres@fixture-pg:5432/fixture --entrypoint /usr/local/bin/migration-entrypoint.sh "$fixture_image" >/dev/null
docker run -d --name "$fixture_api" --network "$fixture_network" \
  -e DATABASE_URL=postgresql://postgres@fixture-pg:5432/fixture -e REDIS_URL=redis://fixture-redis:6379 \
  -e JWT_SECRET=isolated_ci_fixture_secret_at_least_32_characters \
  -e ADMIN_USER_IDS=fixture-ci-admin -e NODE_ENV=production \
  -e QWEN_API_KEY=synthetic-fixture -e QWEN_BASE_URL=http://127.0.0.1:1 \
  -e DEEPSEEK_API_KEY=synthetic-fixture -e DEEPSEEK_BASE_URL=http://127.0.0.1:1 \
  -e MILVUS_URL=http://fixture-milvus:19530 -e QDRANT_URL=http://127.0.0.1:1 "$fixture_image" >/dev/null
fixture_ready=false
for attempt in {1..60}; do
  if docker exec "$fixture_api" node -e "fetch('http://127.0.0.1:3001/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then fixture_ready=true; break; fi
  sleep 1
done
if [[ "$fixture_ready" != true ]]; then
  echo 'Isolated fixture API failed readiness.' >&2
  # Only synthetic CI configuration exists in this isolated container.
  docker logs "$fixture_api" >&2
  exit 1
fi
docker exec -i "$fixture_api" node --input-type=module < scripts/ci/verify-built-api.mjs
