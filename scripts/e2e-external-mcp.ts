#!/usr/bin/env -S npx tsx
/**
 * ExternalMcpLoader E2E — 真实 stdio MCP server 集成测试
 *
 * 流程：
 * 1. spawn scripts/mock-mcp-server.ts 作为子进程
 * 2. 用 stdio transport 连接 McpClient
 * 3. ExternalMcpLoader.registerFromClient 把 tools 注册到 McpRegistry
 * 4. 验证 McpRegistry.get(name).execute() 真实转发到 mock server
 *
 * 退出码：
 * 0 — 全部验证通过
 * 1 — 任一检查失败
 */
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { McpClient } from '../apps/api/src/modules/interview/services/mcp-client';
import { ExternalMcpLoader } from '../apps/api/src/modules/mcp/external-mcp-loader';
import { McpRegistry } from '../apps/api/src/modules/interview/services/mcp-registry';

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const MOCK_SERVER = path.join(ROOT_DIR, 'scripts', 'mock-mcp-server.ts');

let mockProc: ChildProcess | null = null;
let pass = 0;
let fail = 0;

function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
    pass++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    fail++;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('━━━ ExternalMcpLoader E2E ━━━');
  console.log(`Mock server: ${MOCK_SERVER}`);

  // ---- 1. 启动 mock MCP server ----
  console.log('\n[1/5] Spawn mock stdio MCP server...');
  // 让子进程能找到 tsx（pnpm 不在 PATH）
  const env = { ...process.env, PATH: `${path.join(ROOT_DIR, 'apps/api/node_modules/.bin')}:${process.env.PATH}` };
  mockProc = spawn('npx', ['tsx', MOCK_SERVER], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env,
  });

  if (!mockProc.stdout || !mockProc.stdin) {
    console.error('Failed to spawn mock server');
    process.exit(1);
  }

  // 等待 server 启动（stdio server 通常 < 200ms）
  await sleep(800);

  // ---- 2. McpClient 连接 ----
  console.log('\n[2/5] McpClient.connect() via stdio transport...');
  const client = new McpClient({
    name: 'mock',
    transport: 'stdio',
    command: 'npx',
    args: ['tsx', MOCK_SERVER],
    env: { PATH: `${path.join(ROOT_DIR, 'apps/api/node_modules/.bin')}:${process.env.PATH}` },
    timeoutMs: 15000,
  });

  try {
    await client.connect();
    ok('McpClient.connect()', client.isConnected(), 'connected=true');
  } catch (e: any) {
    console.error(`Connect failed: ${e.message}`);
    mockProc?.kill();
    process.exit(1);
  }

  // ---- 3. listTools ----
  console.log('\n[3/5] McpClient.listTools()...');
  const tools = await client.listTools();
  ok('listTools returned 3 tools', tools.length === 3, `got ${tools.length}: ${tools.map(t => t.name).join(', ')}`);
  ok('first tool is fake_search', tools[0]?.name === 'fake_search', tools[0]?.name);

  // ---- 4. loader.registerFromClient → 注册到 Registry ----
  console.log('\n[4/5] ExternalMcpLoader.registerFromClient()...');
  ExternalMcpLoader.reset();
  const count = await ExternalMcpLoader.registerFromClient('mock', client, { transport: 'stdio' });
  ok('registered 3 tools', count === 3, `count=${count}`);

  const t1 = McpRegistry.get('ext_mock_fake_search');
  const t2 = McpRegistry.get('ext_mock_fake_summarize');
  const t3 = McpRegistry.get('ext_mock_fake_echo');
  ok('ext_mock_fake_search registered', !!t1);
  ok('ext_mock_fake_summarize registered', !!t2);
  ok('ext_mock_fake_echo registered', !!t3);
  ok('displayName has server prefix', t1?.displayName?.includes('mock') === true, t1?.displayName);
  ok('category = mcp', t1?.category === 'mcp');

  const status = ExternalMcpLoader.listStatus();
  ok('listStatus returns 1 entry', status.length === 1);
  ok('status[0].status = connected', status[0]?.status === 'connected', status[0]?.status);

  // ---- 5. execute() 真实转发到 mock server ----
  console.log('\n[5/5] Verify execute() forwards to MCP server...');
  const searchResult = await t1!.execute!({ query: 'TypeScript LangGraph', limit: 3 });
  ok('execute(fake_search) returned mock data',
    typeof searchResult === 'object' && searchResult !== null,
    JSON.stringify(searchResult).slice(0, 80));

  // JSON-RPC 2.0 包装：McpClient.callTool 返回 {content: [{type: 'text', text: '...'}]}
  // 我们的 execute 直接透传这个对象
  ok('result has content array', Array.isArray((searchResult as any).content));
  const innerText = (searchResult as any).content?.[0]?.text;
  const innerParsed = JSON.parse(innerText);
  ok('inner text contains mocked=true', innerParsed.mocked === true);
  ok('inner text has results for query',
    Array.isArray(innerParsed.results) && innerParsed.results.length > 0,
    `results=${innerParsed.results?.length}`);

  // fake_echo 测试
  const echoResult = await t3!.execute!({ message: 'hello world' });
  const echoInner = JSON.parse((echoResult as any).content[0].text);
  ok('fake_echo echoes input back', echoInner.echoed === 'hello world', echoInner.echoed);
  ok('fake_echo includes timestamp', typeof echoInner.received_at === 'string');

  // ---- 清理 ----
  await client.close();
  ExternalMcpLoader.unregisterServer('mock');
  mockProc?.kill();

  // ---- 汇总 ----
  console.log('\n━━━ Result ━━━');
  console.log(`✅ Passed: ${pass}`);
  console.log(`❌ Failed: ${fail}`);
  console.log(`Total: ${pass + fail}`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  mockProc?.kill();
  process.exit(1);
});
