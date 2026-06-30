import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@interview-agent/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // 2026-06-29 修复：NestJS 有 setGlobalPrefix('api')，所以上游路由是 /api/...
        // 之前 rewrite: (path) => path.replace(/^\/api/, '') 把 /api/xxx → /xxx
        // 导致上游 404。改成不 rewrite，让 /api 完整透传到 NestJS
        rewrite: (path) => path,
        // 2026-06-23 修复：vite proxy 默认会 buffer SSE 流（chunked encoding），
        // 导致前端 fetch 拿到的 SSE token 是合并后的整段（"突然出现全文"）。
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('X-Forwarded-Proto', 'http');
            proxyReq.setHeader('X-Forwarded-Host', 'localhost:5173');
          });
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('event-stream')) {
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
        headers: {
          'X-Accel-Buffering': 'no',
        },
      },
    },
  },
});
