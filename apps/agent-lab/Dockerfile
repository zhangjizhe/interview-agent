FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY apps/agent-lab/package.json ./apps/agent-lab/
RUN pnpm install --frozen-lockfile=false
COPY apps/agent-lab ./apps/agent-lab
RUN pnpm --filter @interview-agent/agent-lab build

FROM nginx:alpine
COPY --from=builder /app/apps/agent-lab/dist /usr/share/nginx/html
COPY apps/agent-lab/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
