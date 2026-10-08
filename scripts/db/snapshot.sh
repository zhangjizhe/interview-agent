#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

output_dir="${1:-artifacts/db}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_dir="$output_dir/$timestamp"
mkdir -p "$snapshot_dir"

pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" \
  > "$snapshot_dir/database.dump"

DATABASE_URL="$DATABASE_URL" "$(dirname "$0")/schema-fingerprint.sh" "$snapshot_dir"
printf 'Database snapshot: %s\n' "$snapshot_dir/database.dump"
