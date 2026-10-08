#!/usr/bin/env bash
# Isolated synthetic fixtures only. Never reads the application's DATABASE_URL.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
fixture_dir="$(mktemp -d)"
fixture_container="interview-phase2-check-$$"
cleanup() {
  docker rm -fv "$fixture_container" >/dev/null 2>&1 || true
  rm -rf "$fixture_dir"
}
trap cleanup EXIT
# Bind only localhost; fixtures contain no user data or provider credentials.
docker run -d --name "$fixture_container" -p 127.0.0.1::5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
fixture_ready=false
for attempt in {1..30}; do
  if docker exec "$fixture_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    fixture_ready=true
    break
  fi
  sleep 1
done
if [[ "$fixture_ready" != true ]]; then
  docker logs "$fixture_container" >&2
  echo 'Isolated PostgreSQL fixture did not accept TCP connections.' >&2
  exit 1
fi
fixture_port="$(docker port "$fixture_container" 5432/tcp | sed 's/.*://')"
for database in phase2_empty phase2_existing; do
  docker exec "$fixture_container" createdb -h 127.0.0.1 -U postgres "$database"
done
mkdir "$fixture_dir/migrations"
cp apps/api/prisma/schema.prisma "$fixture_dir/schema.prisma"
for migration in apps/api/prisma/migrations/*; do
  # Rehearse the actual pre-tenant upgrade. Later migrations may require
  # organization columns, so excluding just two named migrations is unsafe.
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" < "20260929000000_organizations" ]]; then
    cp -R "$migration" "$fixture_dir/migrations/"
  fi
done
DATABASE_URL="postgresql://postgres@127.0.0.1:$fixture_port/phase2_existing" pnpm --filter @interview-agent/api exec prisma migrate deploy --schema "$fixture_dir/schema.prisma"
docker exec -i "$fixture_container" psql -h 127.0.0.1 -U postgres -d phase2_existing -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO users (id,email,"updatedAt") VALUES ('legacy-fixture','fixture@example.invalid',CURRENT_TIMESTAMP);
INSERT INTO interviews (id,"userId",position) VALUES ('legacy-interview','legacy-fixture','Fixture');
SQL
for database in phase2_empty phase2_existing; do
  DATABASE_URL="postgresql://postgres@127.0.0.1:$fixture_port/$database" pnpm --filter @interview-agent/api exec prisma migrate deploy
done
TENANT_TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$fixture_port/phase2_existing" pnpm --filter @interview-agent/api test:jest --runInBand --testPathPatterns='tenant-database|quota-database|evaluation-jobs.database'
