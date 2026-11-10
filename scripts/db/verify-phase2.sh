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
INSERT INTO interview_tasks (id,"interviewId",type,question,category,difficulty,status,"updatedAt") VALUES
  ('legacy-pending-task','legacy-interview','QUESTION','Synthetic legacy pending question','frontend','easy','PENDING',CURRENT_TIMESTAMP),
  ('legacy-completed-task','legacy-interview','QUESTION','Synthetic legacy completed question','frontend','easy','COMPLETED',CURRENT_TIMESTAMP);
INSERT INTO messages (id,"interviewId",role,content) VALUES ('legacy-assistant-message','legacy-interview','assistant','Synthetic old message without a presentation receipt');
SQL
for database in phase2_empty phase2_existing; do
  DATABASE_URL="postgresql://postgres@127.0.0.1:$fixture_port/$database" pnpm --filter @interview-agent/api exec prisma migrate deploy
done
docker exec -i "$fixture_container" psql -h 127.0.0.1 -U postgres -d phase2_existing -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF (SELECT count(*) FROM interview_tasks WHERE id IN ('legacy-pending-task','legacy-completed-task')) <> 2
    OR NOT EXISTS (SELECT 1 FROM interview_tasks WHERE id='legacy-pending-task' AND status='PENDING' AND question='Synthetic legacy pending question')
    OR NOT EXISTS (SELECT 1 FROM interview_tasks WHERE id='legacy-completed-task' AND status='COMPLETED' AND question='Synthetic legacy completed question')
    OR (SELECT count(*) FROM messages WHERE id='legacy-assistant-message') <> 1
    OR (SELECT count(*) FROM interview_question_presentations) <> 0 THEN
    RAISE EXCEPTION 'Legacy presentation upgrade changed task/message facts or fabricated receipts';
  END IF;
END $$;
SQL
echo 'PASS legacy presentation upgrade preserves tasks/messages without fabricated receipts'
TENANT_TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:$fixture_port/phase2_existing" pnpm --filter @interview-agent/api test:jest --runInBand --testPathPatterns='tenant-database|quota-database|evaluation-jobs.database|question-bank.catalog.database|data-governance.database'

# The HTTP/ACL suites populated real synthetic versions, grants and immutable
# audit evidence. Restore into another database and compare both data and DDL.
docker exec "$fixture_container" pg_dump -h 127.0.0.1 -U postgres -Fc phase2_existing > "$fixture_dir/data.dump"
docker exec "$fixture_container" createdb -h 127.0.0.1 -U postgres phase2_restored
docker exec -i "$fixture_container" pg_restore -h 127.0.0.1 -U postgres -d phase2_restored < "$fixture_dir/data.dump"
for database in phase2_existing phase2_restored; do
  docker exec "$fixture_container" pg_dump -h 127.0.0.1 -U postgres --no-owner --no-privileges "$database" | sed '/^\\restrict /d; /^\\unrestrict /d' > "$fixture_dir/$database.sql"
done
node scripts/ci/pg-dump-compare.mjs "$fixture_dir/phase2_existing.sql" "$fixture_dir/phase2_restored.sql"
docker exec -i "$fixture_container" psql -h 127.0.0.1 -U postgres -d phase2_restored -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM lab_data_record_versions)
    OR NOT EXISTS (SELECT 1 FROM lab_data_grants)
    OR NOT EXISTS (SELECT 1 FROM lab_data_audit WHERE action='COLLECTION_ARCHIVE') THEN
    RAISE EXCEPTION 'Restored data governance evidence is incomplete';
  END IF;
END $$;
SQL
echo 'PASS isolated data governance restore: exact DDL/data, revisions, grants and archive audit retained'
