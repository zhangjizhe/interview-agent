#!/usr/bin/env bash
# Narrow store regression runner: private PostgreSQL, no API server or provider.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
fixture_image="${1:-interview-api:presentation-store-final}"
fixture_network="interview-presentation-store-$$"
fixture_pg="$fixture_network-pg"
fixture_app="$fixture_network-app"
cleanup() {
  docker rm -fv "$fixture_app" "$fixture_pg" >/dev/null 2>&1 || true
  docker network rm "$fixture_network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create --internal "$fixture_network" >/dev/null
docker run -d --name "$fixture_pg" --network "$fixture_network" --network-alias fixture-pg -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
fixture_ready=false
for attempt in {1..30}; do
  if docker exec "$fixture_pg" pg_isready -U postgres >/dev/null 2>&1; then fixture_ready=true; break; fi
  sleep 1
done
test "$fixture_ready" = true
docker exec "$fixture_pg" createdb -U postgres fixture
docker run --rm --network "$fixture_network" -e DATABASE_URL=postgresql://postgres@fixture-pg:5432/fixture --entrypoint /usr/local/bin/migration-entrypoint.sh "$fixture_image"
# Synthetic owners only. This runner never reads the application DATABASE_URL.
docker exec -i "$fixture_pg" psql -U postgres -d fixture -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO organizations (id,name) VALUES ('synthetic-store-owner-org','Synthetic store owner'),('synthetic-store-foreign-org','Synthetic store foreign');
INSERT INTO users (id,email,"organizationId","updatedAt") VALUES
('fixture-ci-owner','synthetic-store-owner@example.invalid','synthetic-store-owner-org',CURRENT_TIMESTAMP),
('fixture-ci-admin','synthetic-store-foreign@example.invalid','synthetic-store-foreign-org',CURRENT_TIMESTAMP);
SQL
docker create --name "$fixture_app" --network "$fixture_network" \
  -e DATABASE_URL=postgresql://postgres@fixture-pg:5432/fixture \
  -e NODE_ENV=production -e GOLDEN_FIXTURE_SYNTHETIC=1 \
  --entrypoint node "$fixture_image" /tmp/verify-question-presentation-store.cjs >/dev/null
docker cp scripts/ci/verify-question-presentation-store.cjs "$fixture_app:/tmp/verify-question-presentation-store.cjs"
docker start -a "$fixture_app"
test "$(docker inspect --format '{{.State.ExitCode}}' "$fixture_app")" = 0
