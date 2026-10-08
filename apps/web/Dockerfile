# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9.0.0
ENV npm_config_registry=https://registry.npmjs.org

# 拷贝 monorepo 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY patches ./patches
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/

# BuildKit cache keeps partial downloads across retrying builds.
RUN --mount=type=cache,id=interview-agent-pnpm-web,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# 拷贝源码
COPY apps ./apps
COPY packages ./packages

# Build web（tsc 类型检查 + vite 打包）
RUN pnpm --filter @interview-agent/web build

# ===== 运行时：nginx =====
FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
