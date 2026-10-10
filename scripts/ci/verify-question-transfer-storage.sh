#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
fixture_image="${1:-interview-api:verification}"
fixture_network="question-transfer-storage-$$"
fixture_etcd="$fixture_network-etcd"
fixture_milvus="$fixture_network-milvus"
fixture_runner="$fixture_network-runner"
fixture_diagnostics="$(mktemp -d "${TMPDIR:-/tmp}/question-transfer-storage.XXXXXX")"
chmod 700 "$fixture_diagnostics"
cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    docker logs --tail 100 "$fixture_milvus" > "$fixture_diagnostics/milvus.log" 2>&1 || true
    docker logs --tail 100 "$fixture_etcd" > "$fixture_diagnostics/etcd.log" 2>&1 || true
  fi
  docker rm -fv "$fixture_runner" "$fixture_milvus" "$fixture_etcd" >/dev/null 2>&1 || true
  docker network rm "$fixture_network" >/dev/null 2>&1 || true
  if [[ "$status" -ne 0 && "${FIXTURE_KEEP_FAILURE:-}" == '1' ]]; then
    echo "Synthetic diagnostics retained: $fixture_diagnostics" >&2
  else
    rm -rf "$fixture_diagnostics"
  fi
}
trap cleanup EXIT
# Unique empty engines, internal network, no business environment or host ports.
docker network create --internal "$fixture_network" >/dev/null
docker run -d --name "$fixture_etcd" --network "$fixture_network" --network-alias fixture-etcd quay.io/coreos/etcd:v3.5.5 etcd -advertise-client-urls=http://fixture-etcd:2379 -listen-client-urls http://0.0.0.0:2379 --data-dir /etcd >/dev/null
docker run -d --name "$fixture_milvus" --network "$fixture_network" --network-alias fixture-milvus -e ETCD_ENDPOINTS=fixture-etcd:2379 -e COMMON_STORAGETYPE=local milvusdb/milvus:v2.5.3 milvus run standalone >/dev/null
fixture_ready=false
for attempt in {1..90}; do
  if docker exec "$fixture_milvus" curl --fail --silent --max-time 3 http://127.0.0.1:9091/healthz >/dev/null 2>&1; then fixture_ready=true; break; fi
  sleep 1
done
test "$fixture_ready" = true
docker run -d --name "$fixture_runner" --network "$fixture_network" -e LAB_FIXTURE_SYNTHETIC=1 -e MILVUS_URL=http://fixture-milvus:19530 --entrypoint sleep "$fixture_image" 600 >/dev/null
for module in question-bank-transfer-plan question-bank-transfer-executor question-bank-transfer-milvus; do
  docker cp "scripts/$module.mjs" "$fixture_runner:/tmp/$module.mjs"
done
docker cp scripts/ci/verify-question-transfer-storage.mjs "$fixture_runner:/tmp/verify-question-transfer-storage.mjs"
docker exec "$fixture_runner" node /tmp/verify-question-transfer-storage.mjs > "$fixture_diagnostics/storage.log" 2>&1 || { cat "$fixture_diagnostics/storage.log" >&2; exit 1; }
cat "$fixture_diagnostics/storage.log"
