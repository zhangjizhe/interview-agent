# syntax=docker/dockerfile:1.6
# ===== Builder stage =====
# 装 native build 工具（Prisma binary client 编译）+ nest build
FROM node:20-alpine AS builder

WORKDIR /app

# Native build 工具 + libssl（Prisma binary 需要）+ curl（healthcheck）
# 单独 RUN 让 cache 命中率高
RUN apk add --no-cache openssl python3 make g++ curl

# pnpm
RUN npm install -g pnpm@9

# 拷贝 monorepo 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/

# 装依赖
RUN pnpm install --frozen-lockfile=false

# 拷贝源码
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig*.json ./apps/api/
COPY apps/api/nest-cli.json ./apps/api/
COPY apps/api/config ./apps/api/config
COPY apps/api/knowledge-base.json ./apps/api/knowledge-base.json
COPY packages/shared-types ./packages/shared-types

# nest build
WORKDIR /app/apps/api
RUN ./node_modules/.bin/nest build

# Prisma：先 copy schema，再 generate 生成 client（runtime 需要）
# 2026-06-26 修：之前只 copy prisma 目录但没 generate，导致 runtime
# @prisma/client did not initialize yet
COPY apps/api/prisma ./prisma
RUN ./node_modules/.bin/prisma generate

# entrypoint
COPY apps/api/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# ===== Runtime stage =====
# 不装 g++/make/python3，只装运行时需要的 openssl + curl
FROM node:20-alpine AS runtime

WORKDIR /app

# 运行时只需要：openssl（Prisma runtime）+ curl（docker healthcheck）
# 不装 python3/make/g++，镜像小 600MB+，build 快 10x
RUN apk add --no-cache openssl curl

# pnpm（容器内手动装包用）
RUN npm install -g pnpm@9

# 从 builder 拷贝已 build 的产物
COPY --from=builder /app/apps/api/dist /app/apps/api/dist
COPY --from=builder /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=builder /app/apps/api/prisma /app/apps/api/prisma
COPY --from=builder /app/apps/api/package.json /app/apps/api/package.json
COPY --from=builder /app/apps/api/config /app/apps/api/config
COPY --from=builder /app/apps/api/knowledge-base.json /app/apps/api/knowledge-base.json
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/pnpm-workspace.yaml /app/
COPY --from=builder /app/package.json /app/
COPY --from=builder /app/.npmrc /app/
COPY --from=builder /usr/local/bin/docker-entrypoint.sh /usr/local/bin/

WORKDIR /app/apps/api

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]