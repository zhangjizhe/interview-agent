FROM node:20-alpine
WORKDIR /app

# 装 libssl（Prisma 需要）+ pnpm + native build 工具
RUN apk add --no-cache openssl python3 make g++
RUN npm install -g pnpm@9

# 装运行时依赖（含 devDeps，因为我们要 build）
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN pnpm install --frozen-lockfile=false

# 拷贝源码
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig*.json ./apps/api/
COPY apps/api/nest-cli.json ./apps/api/
COPY apps/api/config ./apps/api/config
COPY apps/api/knowledge-base.json ./apps/api/knowledge-base.json
COPY packages/shared-types ./packages/shared-types

# 内部 build
WORKDIR /app/apps/api
RUN ./node_modules/.bin/nest build

COPY apps/api/prisma ./prisma
COPY apps/api/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
