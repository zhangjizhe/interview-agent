#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required for the source database}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required for an empty isolated restore database}"

snapshot_dir="${1:?Pass the snapshot directory created by snapshot.sh}"
snapshot_file="$snapshot_dir/database.dump"

test -f "$snapshot_file"
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname "$RESTORE_DATABASE_URL" "$snapshot_file"

source_fingerprint="$(DATABASE_URL="$DATABASE_URL" "$(dirname "$0")/schema-fingerprint.sh" "$snapshot_dir/source" >/dev/null; cat "$snapshot_dir/source/schema.sha256")"
restore_fingerprint="$(DATABASE_URL="$RESTORE_DATABASE_URL" "$(dirname "$0")/schema-fingerprint.sh" "$snapshot_dir/restored" >/dev/null; cat "$snapshot_dir/restored/schema.sha256")"

test "$source_fingerprint" = "$restore_fingerprint"
printf 'Restore verified: schema fingerprint %s\n' "$source_fingerprint"
