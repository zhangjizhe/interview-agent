#!/bin/sh
set -e

echo "🔧 Running database migrations..."
cd /app/apps/api

# 只执行版本化迁移。失败时让容器退出，避免未记录 schema 变更后继续接收流量。
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma generate

echo "🚀 Starting API server..."
exec node dist/main.js
