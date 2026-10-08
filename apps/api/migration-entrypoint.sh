#!/bin/sh
set -eu

cd /app/apps/api

echo "Running Prisma migration job..."
./node_modules/.bin/prisma migrate deploy
node scripts/setup-checkpointer.mjs
./node_modules/.bin/prisma migrate status
echo "Prisma migration job completed."
