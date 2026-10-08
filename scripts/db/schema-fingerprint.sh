#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

output_dir="${1:-artifacts/db}"
mkdir -p "$output_dir"

schema_file="$output_dir/schema.sql"
pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL" \
  | sed '/^-- Dumped by /d;/^-- Started on /d;/^-- Completed on /d;/^\\restrict /d;/^\\unrestrict /d' \
  > "$schema_file"

shasum -a 256 "$schema_file" | awk '{print $1}' > "$output_dir/schema.sha256"
printf 'Schema fingerprint: %s\n' "$(cat "$output_dir/schema.sha256")"
