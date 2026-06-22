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
        rewrite: (path) => path.replace(/^\/api/, ''),
        // 2026-06-23 修复：vite proxy 默认会 buffer SSE 流（chunked encoding），
        // 导致前端 fetch 拿到的 SSE token 是合并后的整段（"突然出现全文"）。
        // 配置：
        //   - configure: 透传 target，rewrite 不变（vite 已自动）
        //   - SSE proxy 标准做法：关掉 proxy 响应 buffering，直接流式转发
        //   - 实际上 vite http-proxy 在 SSE 上游用 `changeOrigin: true` + chunked
        //     encoding 时如果上游 Content-Length 缺失就会 buffer，这里显式声明 SSE 路径
        // 最佳实践：让上游用 chunked + proxy 不 buffer
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('X-Forwarded-Proto', 'http');
            proxyReq.setHeader('X-Forwarded-Host', 'localhost:5173');
          });
          proxy.on('proxyRes', (proxyRes) => {
            // 对 SSE 响应显式设置 no-buffer
            if (proxyRes.headers['content-type']?.includes('event-stream')) {
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
        // 透传 SSE 关键头
        headers: {
          'X-Accel-Buffering': 'no',
        },
      },
    },
  },
});
