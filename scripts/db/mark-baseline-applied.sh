#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${CONFIRM_PRODUCTION_BASELINE:?Set CONFIRM_PRODUCTION_BASELINE=20260815000000_production_baseline after backup and restore verification}"
: "${EXPECTED_SCHEMA_SHA256:?Set EXPECTED_SCHEMA_SHA256 from the verified pre-baseline source fingerprint}"

baseline="20260815000000_production_baseline"

test "$CONFIRM_PRODUCTION_BASELINE" = "$baseline"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

actual_fingerprint="$(
  DATABASE_URL="$DATABASE_URL" "$(dirname "$0")/schema-fingerprint.sh" "$work_dir" >/dev/null
  cat "$work_dir/schema.sha256"
)"
test "$actual_fingerprint" = "$EXPECTED_SCHEMA_SHA256"

cd "$(dirname "$0")/../../apps/api"
./node_modules/.bin/prisma migrate resolve --applied "$baseline"
./node_modules/.bin/prisma migrate status
printf 'Baseline %s marked as applied after schema validation.\n' "$baseline"
