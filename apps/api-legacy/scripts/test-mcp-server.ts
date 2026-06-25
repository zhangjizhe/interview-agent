#!/usr/bin/env node
/**
 * 最小可工作 MCP stdio server (用于测试 McpClient)
 *
 * 提供 2 个 tools:
 * - echo: 回显输入
 * - get_github_user: 模拟 GitHub API（不真发请求，演示用）
 *
 * 用法：
 *   npx tsx test-mcp-server.ts
 *
 * McpClient 会 spawn 这个进程并通过 stdin/stdout 通信
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'test-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'echo',
      description: '回显输入文本',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: '要回显的文本' } },
        required: ['text'],
      },
    },
    {
      name: 'get_github_user',
      description: '查询 GitHub 用户公开信息（演示，不真发请求）',
      inputSchema: {
        type: 'object',
        properties: { username: { type: 'string', description: 'GitHub 用户名' } },
        required: ['username'],
      },
    },
  ],
}));

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  if (name === 'echo') {
    return { content: [{ type: 'text', text: `Echo: ${args.text}` }] };
  }

  if (name === 'get_github_user') {
    // 模拟数据，不发真请求
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          login: args.username,
          name: 'Mock User',
          public_repos: 42,
          followers: 100,
          bio: '演示数据 - 由 test-mcp-server.ts 提供',
          note: '真实接入 GitHub MCP 时这里会替换为 GitHub API 返回',
        }, null, 2),
      }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error('[test-mcp-server] ready on stdio');
}).catch((e) => {
  console.error('[test-mcp-server] connect error:', e);
  process.exit(1);
});