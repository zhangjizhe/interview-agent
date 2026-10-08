#!/bin/sh
set -e

echo "Starting API server after the migration job completed..."
exec node dist/main.js
