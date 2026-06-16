# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

# 拷贝 monorepo 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/

# 装依赖
RUN pnpm install --frozen-lockfile=false

# 拷贝源码
COPY apps ./apps
COPY packages ./packages

# Build web（tsc 类型检查 + vite 打包）
# pnpm symlink 问题：vite 不在 apps/web/node_modules/.bin，需要从根 node_modules 调
RUN cd apps/web && ../../node_modules/.bin/tsc --noEmit && ../../node_modules/.bin/vite build

# ===== 运行时：nginx =====
FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
