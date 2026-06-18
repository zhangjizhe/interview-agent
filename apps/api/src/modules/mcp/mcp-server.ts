/**
 * MCP Server 独立进程入口
 *
 * P1-4 修复：把内部工具暴露成 stdio MCP Server
 *
 * 启动方式：
 * ```bash
 * node dist/mcp-server.js
 * ```
 *
 * MCP Client 可以这样调用：
 * ```typescript
 * import { Client } from '@modelcontextprotocol/sdk/client/stdio.js';
 *
 * const client = new Client({ name: 'interview-agent', version: '1.0.0' });
 * await client.connect(transport);
 *
 * const tools = await client.request({ method: 'tools/list' });
 * const result = await client.request({
 *   method: 'tools/call',
 *   params: { name: 'bocha_search', arguments: { query: 'React 18', count: 3 } }
 * });
 * ```
 */

import { createMcpStdioServer } from './mcp-adapter.service';

async function main() {
  const server = await createMcpStdioServer({
    name: 'interview-agent',
    version: '1.0.0',
    description: 'AI 面试智能体工具集',
  });

  // 保持进程运行
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch(console.error);
