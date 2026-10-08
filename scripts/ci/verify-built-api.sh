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
fixture_qdrant="$fixture_network-qdrant"
fixture_api="$fixture_network-api"
fixture_backup="$(mktemp -d "${TMPDIR:-/tmp}/interview-recovery.XXXXXX")"
chmod 700 "$fixture_backup"
qdrant_image='qdrant/qdrant@sha256:75eab8c4ba42096724fdcfde8b4de0b5713d529dde32f285a1f86fdcb2c9e50c'
cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    docker logs "$fixture_milvus" >&2 2>/dev/null || true
    docker logs "$fixture_etcd" >&2 2>/dev/null || true
    docker logs "$fixture_qdrant" >&2 2>/dev/null || true
  fi
  docker rm -fv "$fixture_api" "$fixture_pg" "$fixture_redis" "$fixture_milvus" "$fixture_etcd" "$fixture_qdrant" >/dev/null 2>&1 || true
  docker network rm "$fixture_network" >/dev/null 2>&1 || true
  rm -rf "$fixture_backup"
}
trap cleanup EXIT
# Internal Docker network blocks external providers. No host ports or real .env.
docker network create --internal "$fixture_network" >/dev/null
docker run -d --name "$fixture_pg" --network "$fixture_network" --network-alias fixture-pg -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
docker run -d --name "$fixture_redis" --network "$fixture_network" --network-alias fixture-redis redis:7-alpine >/dev/null
docker run -d --name "$fixture_qdrant" --network "$fixture_network" --network-alias fixture-qdrant "$qdrant_image" >/dev/null
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
  -e MILVUS_URL=http://fixture-milvus:19530 -e QDRANT_URL=http://fixture-qdrant:6333 "$fixture_image" >/dev/null
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
docker cp scripts/ci/verify-training-loop.cjs "$fixture_api:/tmp/verify-training-loop.cjs"
docker cp scripts/ci/verify-question-store.cjs "$fixture_api:/tmp/verify-question-store.cjs"
docker cp scripts/ci/verify-vector-recovery.cjs "$fixture_api:/tmp/verify-vector-recovery.cjs"
docker exec -i "$fixture_api" node --input-type=module < scripts/ci/verify-built-api.mjs
docker exec "$fixture_api" node /tmp/verify-vector-recovery.cjs seed

# Fault only the isolated Redis; public probes must be bounded and truthful.
docker stop "$fixture_redis" >/dev/null
docker exec "$fixture_api" node -e "(async()=>{const start=Date.now();const r=await fetch('http://127.0.0.1:3001/api/health/ready',{signal:AbortSignal.timeout(9000)});if(r.status!==503)throw Error('readiness must fail');const alive=await fetch('http://127.0.0.1:3001/api/health');if(!alive.ok)throw Error('liveness must survive');console.log('PASS isolated Redis fault: readiness503/liveness200',Date.now()-start,'ms')})().catch(e=>{console.error(e);process.exit(1)})"
docker start "$fixture_redis" >/dev/null
for attempt in {1..30}; do
  if docker exec "$fixture_api" node -e "fetch('http://127.0.0.1:3001/api/health/ready',{signal:AbortSignal.timeout(9000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$fixture_api" node -e "(async()=>{const start=Date.now();const r=await Promise.all(Array.from({length:25},()=>fetch('http://127.0.0.1:3001/api/health/ready',{signal:AbortSignal.timeout(9000)})));if(!r.every(x=>x.ok))throw Error('probe recovery');console.log('PASS isolated concurrent readiness 25/25',Date.now()-start,'ms; not a production capacity benchmark')})().catch(e=>{console.error(e);process.exit(1)})"

# Quiesce synthetic writes. Portable SQL dump and paired Milvus/etcd/Qdrant
# offline storage are restored into newly created fixture engines.
docker stop "$fixture_api" >/dev/null
docker exec "$fixture_pg" pg_dump -U postgres -Fc fixture > "$fixture_backup/database.dump"
docker exec "$fixture_pg" createdb -U postgres fixture_restored
docker exec -i "$fixture_pg" pg_restore -U postgres -d fixture_restored < "$fixture_backup/database.dump"
for database in fixture fixture_restored; do
  docker exec "$fixture_pg" pg_dump -U postgres --no-owner --no-privileges "$database" | sed '/^\\restrict /d; /^\\unrestrict /d' > "$fixture_backup/$database.sql"
done
cmp "$fixture_backup/fixture.sql" "$fixture_backup/fixture_restored.sql"
echo 'PASS complete normalized PostgreSQL schema/data/sequence dump equality after restore'

docker stop "$fixture_milvus" "$fixture_qdrant" >/dev/null
docker stop "$fixture_etcd" >/dev/null
mkdir "$fixture_backup/milvus" "$fixture_backup/etcd" "$fixture_backup/qdrant"
docker cp "$fixture_milvus:/var/lib/milvus/." "$fixture_backup/milvus"
docker cp "$fixture_etcd:/etcd/." "$fixture_backup/etcd"
docker cp "$fixture_qdrant:/qdrant/storage/." "$fixture_backup/qdrant"
docker rm -fv "$fixture_milvus" "$fixture_etcd" "$fixture_qdrant" >/dev/null
docker create --name "$fixture_etcd" --network "$fixture_network" --network-alias fixture-etcd quay.io/coreos/etcd:v3.5.5 etcd -advertise-client-urls=http://fixture-etcd:2379 -listen-client-urls http://0.0.0.0:2379 --data-dir /etcd >/dev/null
docker create --name "$fixture_milvus" --network "$fixture_network" --network-alias fixture-milvus -e ETCD_ENDPOINTS=fixture-etcd:2379 -e COMMON_STORAGETYPE=local milvusdb/milvus:v2.5.3 milvus run standalone >/dev/null
docker create --name "$fixture_qdrant" --network "$fixture_network" --network-alias fixture-qdrant "$qdrant_image" >/dev/null
docker cp "$fixture_backup/milvus/." "$fixture_milvus:/var/lib/milvus"
docker cp "$fixture_backup/etcd/." "$fixture_etcd:/etcd"
docker cp "$fixture_backup/qdrant/." "$fixture_qdrant:/qdrant/storage"
docker start "$fixture_etcd" >/dev/null
fixture_etcd_ready=false
for attempt in {1..30}; do
  if docker exec "$fixture_etcd" etcdctl endpoint health --endpoints=http://127.0.0.1:2379 >/dev/null 2>&1; then fixture_etcd_ready=true; break; fi
  sleep 1
done
test "$fixture_etcd_ready" = true
docker start "$fixture_milvus" "$fixture_qdrant" >/dev/null
fixture_vector_ready=false
for attempt in {1..90}; do
  if docker exec "$fixture_milvus" curl --fail --silent http://127.0.0.1:9091/healthz >/dev/null 2>&1; then fixture_vector_ready=true; break; fi
  sleep 1
done
test "$fixture_vector_ready" = true
docker start "$fixture_api" >/dev/null
docker exec "$fixture_api" node /tmp/verify-vector-recovery.cjs restored
echo 'PASS isolated recovery drill; synthetic data only, no production RPO/RTO claim'
