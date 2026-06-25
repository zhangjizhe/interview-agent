#!/bin/sh
set -e

echo "🔧 Running database migrations..."
cd /app/apps/api

# 用本地 node_modules 的 prisma，避免 npx 拉最新版
./node_modules/.bin/prisma db push --skip-generate --accept-data-loss 2>&1 || true
./node_modules/.bin/prisma generate 2>&1 || true

echo "🚀 Starting API server..."
exec node dist/main.js
