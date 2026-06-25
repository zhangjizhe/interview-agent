#!/usr/bin/env node
/**
 * McpClient demo — 启动 stdio MCP server，连接后调用 echo 和 get_github_user
 *
 * 验证：
 * 1. McpClient 能 spawn stdio 子进程
 * 2. 能 listTools 拿到 2 个 tool
 * 3. 能 callTool 拿到结果
 *
 * 用法：
 *   npx tsx scripts/test-mcp-client.ts
 */
process.chdir('/Users/zhangjizhe/Desktop/interview-agent-2/apps/api');

import { McpClient } from '../src/modules/interview/services/mcp-client';

const client = new McpClient({
  name: 'test-stdio',
  transport: 'stdio',
  command: 'npx',
  args: ['tsx', '/Users/zhangjizhe/Desktop/interview-agent-2/apps/api/scripts/test-mcp-server.ts'],
  timeoutMs: 15_000,
});

(async () => {
  console.log('🚀 McpClient demo starting...\n');

  await client.connect();
  console.log('✅ Connected\n');

  console.log('📋 Listing tools...');
  const tools = await client.listTools();
  console.log(`Found ${tools.length} tools: ${tools.map(t => t.name).join(', ')}\n`);

  console.log('🔧 Calling echo...');
  const echoResult = await client.callTool('echo', { text: 'hello from McpClient demo' });
  console.log('Result:', JSON.stringify(echoResult, null, 2));
  console.log();

  console.log('🔧 Calling get_github_user...');
  const ghResult = await client.callTool('get_github_user', { username: 'zhangjizhe' });
  console.log('Result:', JSON.stringify(ghResult, null, 2));
  console.log();

  await client.close();
  console.log('✅ Demo complete - McpClient working correctly');
})().catch(e => {
  console.error('❌ FAIL:', e.message);
  process.exit(1);
});