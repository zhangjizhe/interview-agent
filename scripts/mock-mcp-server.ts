#!/usr/bin/env -S npx tsx
/**
 * Mock stdio MCP Server — 测试用
 *
 * 提供 3 个 fake tools,验证 ExternalMcpLoader + McpClient 流式集成是否走通。
 *
 * 使用方式：
 *   npx tsx scripts/mock-mcp-server.ts
 *
 * 真实接入时配置：
 *   {
 *     "name": "mock",
 *     "transport": "stdio",
 *     "command": "npx",
 *     "args": ["tsx", "scripts/mock-mcp-server.ts"],
 *     "enabled": true
 *   }
 *
 * 输出：JSON-RPC 2.0 格式 over stdin/stdout (newline-delimited)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'mock-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// tools/list 返回这 3 个 fake tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'fake_search',
        description: 'Mock search tool — returns deterministic fake results for testing',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'search query' },
            limit: { type: 'number', description: 'max results', default: 3 },
          },
          required: ['query'],
        },
      },
      {
        name: 'fake_summarize',
        description: 'Mock summarize tool — returns fixed summary for any input',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'text to summarize' },
          },
          required: ['text'],
        },
      },
      {
        name: 'fake_echo',
        description: 'Mock echo tool — returns the input back with timestamp',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      },
    ],
  };
});

// tools/call：根据 toolName 返回 mock 数据
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const now = new Date().toISOString();

  switch (name) {
    case 'fake_search':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              results: [
                { title: `Mock result 1 for "${args.query}"`, url: 'https://mock/1', score: 0.95 },
                { title: `Mock result 2 for "${args.query}"`, url: 'https://mock/2', score: 0.87 },
              ],
              mocked: true,
              timestamp: now,
            }),
          },
        ],
      };
    case 'fake_summarize':
      return {
        content: [
          {
            type: 'text',
            text: `[MOCK SUMMARY of ${(args.text as string)?.length || 0} chars] This is a fake summary for testing.`,
          },
        ],
      };
    case 'fake_echo':
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              echoed: args.message,
              received_at: now,
            }),
          },
        ],
      };
    default:
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown mock tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
});

// 启动 stdio transport（包到 main async 函数避免 top-level await 在 cjs 下报错）
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 优雅关闭
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  console.error('[mock-mcp-server] started, listening on stdio');
}

main().catch((e) => {
  console.error('[mock-mcp-server] fatal:', e);
  process.exit(1);
});
