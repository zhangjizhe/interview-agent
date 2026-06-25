/**
 * ExternalMcpLoader 单测 — mock McpClient，验证 loader 流程
 *
 * 覆盖场景：
 * 1. registerFromClient：mock client 返回 2 个 tool → 应该注册到 McpRegistry
 * 2. 注册名带 ext_<server>_<tool> 前缀 + sanitize 特殊字符
 * 3. bindExecute 转发：调用 McpRegistry.get(name).execute → 应转发到 client.callTool
 * 4. callTool 失败：execute 返回结构化错误 {error, server, tool}
 * 5. listStatus 报告 server 状态
 * 6. unregisterServer 清理所有 ext_<server>_* 工具
 * 7. loadFromConfig 读取 JSON + 过滤 builtin + 失败降级
 * 8. reset 清空所有状态
 */
import { ExternalMcpLoader } from '../modules/mcp/external-mcp-loader';
import { McpRegistry } from '../modules/interview/services/mcp-registry';
import { McpClient } from '../modules/interview/services/mcp-client';

// ===== Mock 链污染隔离 =====
// mcp-client.ts import @modelcontextprotocol/sdk/client/streamableHttp.js，
// 顶层触发 pkce-challenge native ESM → ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG
// jest 自动 hoist 到顶部，在 mcp-client.ts import 前替换
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({}));
jest.mock('../modules/interview/services/mcp-client');

const MockedMcpClient = McpClient as jest.MockedClass<typeof McpClient>;

function makeMockClient(tools: Array<{ name: string; description?: string; inputSchema?: any }>, callResults?: Record<string, any>): any {
  const mock = {
    listTools: jest.fn().mockResolvedValue(
      tools.map((t) => ({
        name: t.name,
        description: t.description || `Mock tool ${t.name}`,
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      })),
    ),
    callTool: jest.fn().mockImplementation(async (toolName: string, _args: any) => {
      if (callResults && toolName in callResults) {
        const r = callResults[toolName];
        if (r instanceof Error) throw r;
        return r;
      }
      return { ok: true, tool: toolName, mocked: true };
    }),
    close: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    connect: jest.fn().mockResolvedValue(undefined),
  };
  return mock;
}

beforeEach(() => {
  ExternalMcpLoader.reset();
  // 清掉 in-code register 的 builtin tool，避免测试间互相污染
  // 这里只清理 ext_ 前缀的（loader 加载的）
  // builtin 工具（bocha_search 等）保留
  jest.clearAllMocks();
});

afterEach(() => {
  ExternalMcpLoader.reset();
});

describe('ExternalMcpLoader - registerFromClient', () => {
  it('1) registers all tools from mock client with ext_<server>_ prefix', async () => {
    const mock = makeMockClient([
      { name: 'get_user', description: 'Get GH user' },
      { name: 'list_repos', description: 'List GH repos' },
    ]);

    const count = await ExternalMcpLoader.registerFromClient('github_official', mock);
    expect(count).toBe(2);

    // 验证 Registry 中能找到
    const t1 = McpRegistry.get('ext_github_official_get_user');
    const t2 = McpRegistry.get('ext_github_official_list_repos');
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    expect(t1?.description).toBe('Get GH user');
    expect(t2?.description).toBe('List GH repos');
  });

  it('2) sanitizes special chars in tool name to underscores', async () => {
    const mock = makeMockClient([
      { name: 'repo.create.issue', description: 'create issue' },
    ]);
    await ExternalMcpLoader.registerFromClient('gh', mock);

    // 点的 sanitize → 下划线
    const t = McpRegistry.get('ext_gh_repo_create_issue');
    expect(t).toBeDefined();
  });

  it('3) bindExecute forwards to McpClient.callTool with raw tool name (no prefix)', async () => {
    const mock = makeMockClient(
      [{ name: 'get_user' }],
      { get_user: { login: 'zhangjizhe', followers: 42 } },
    );
    await ExternalMcpLoader.registerFromClient('gh', mock);

    const tool = McpRegistry.get('ext_gh_get_user');
    expect(tool?.execute).toBeDefined();

    const result = await tool!.execute!({ username: 'zhangjizhe' });
    expect(mock.callTool).toHaveBeenCalledWith('get_user', { username: 'zhangjizhe' });
    expect(result).toEqual({ login: 'zhangjizhe', followers: 42 });
  });

  it('4) callTool throws → execute returns structured error object', async () => {
    const mock = makeMockClient(
      [{ name: 'broken_tool' }],
      { broken_tool: new Error('connection timeout') },
    );
    await ExternalMcpLoader.registerFromClient('srv', mock);

    const tool = McpRegistry.get('ext_srv_broken_tool');
    const result = await tool!.execute!({});
    expect(result).toEqual({
      error: 'connection timeout',
      server: 'srv',
      tool: 'broken_tool',
    });
  });
});

describe('ExternalMcpLoader - listStatus', () => {
  it('5) reports connected status with registered tool names after load', async () => {
    const mock = makeMockClient([
      { name: 'tool_a' },
      { name: 'tool_b' },
      { name: 'tool_c' },
    ]);
    await ExternalMcpLoader.registerFromClient('demo', mock);

    const status = ExternalMcpLoader.listStatus();
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({
      name: 'demo',
      transport: 'mock',
      status: 'connected',
      rawToolCount: 3,
      tools: ['ext_demo_tool_a', 'ext_demo_tool_b', 'ext_demo_tool_c'],
    });
  });

  it('returns empty array when no server loaded', () => {
    expect(ExternalMcpLoader.listStatus()).toEqual([]);
  });
});

describe('ExternalMcpLoader - unregisterServer', () => {
  it('6) removes all ext_<server>_* tools from registry + status', async () => {
    const mock = makeMockClient([
      { name: 'tool_a' },
      { name: 'tool_b' },
    ]);
    await ExternalMcpLoader.registerFromClient('gh', mock);

    expect(McpRegistry.get('ext_gh_tool_a')).toBeDefined();
    expect(McpRegistry.get('ext_gh_tool_b')).toBeDefined();

    const removed = ExternalMcpLoader.unregisterServer('gh');
    expect(removed).toBe(2);

    expect(McpRegistry.get('ext_gh_tool_a')).toBeUndefined();
    expect(McpRegistry.get('ext_gh_tool_b')).toBeUndefined();
    expect(ExternalMcpLoader.listStatus()).toEqual([]);
    expect(mock.close).toHaveBeenCalled();
  });

  it('does not affect builtin tools', async () => {
    const mock = makeMockClient([{ name: 'tool_a' }]);
    await ExternalMcpLoader.registerFromClient('ext', mock);

    // builtin bocha_search 应该在（in-code register 的）
    const builtin = McpRegistry.get('bocha_search');
    expect(builtin).toBeDefined();

    ExternalMcpLoader.unregisterServer('ext');

    // builtin 仍存在
    expect(McpRegistry.get('bocha_search')).toBeDefined();
  });
});

describe('ExternalMcpLoader - loadFromConfig', () => {
  it('7) reads config + filters builtin + registers external + handles failures gracefully', async () => {
    const fs = require('fs/promises');
    const path = require('path');
    const os = require('os');

    // 写一个临时 config
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    const cfgPath = path.join(tmpDir, 'mcp-servers.json');
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        servers: [
          { name: 'github', transport: 'streamable-http', url: 'http://x', enabled: true },
          { name: 'filesystem', transport: 'stdio', command: 'echo', enabled: true },
          { name: 'disabled_one', transport: 'stdio', command: 'x', enabled: false },
          { name: 'builtin_one', transport: 'builtin', enabled: true }, // 应该被过滤
        ],
      }),
    );

    // Mock McpClient 构造器：不同 server 名返回不同 mock
    MockedMcpClient.mockImplementation((config: any) => {
      if (config.name === 'github') {
        return makeMockClient([{ name: 'get_user' }, { name: 'list_repos' }]);
      }
      // filesystem mock：listTools 抛错（模拟启动失败）
      return {
        listTools: jest.fn().mockRejectedValue(new Error('command not found')),
        callTool: jest.fn(),
        close: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(false),
      } as any;
    });

    const result = await ExternalMcpLoader.loadFromConfig(cfgPath);

    // github 加载成功 → 2 tools
    // filesystem 失败 → 计入 errors
    // disabled / builtin 被过滤
    expect(result.loaded).toBe(1);
    expect(result.registeredTools).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/filesystem/);

    // github 工具已注册
    expect(McpRegistry.get('ext_github_get_user')).toBeDefined();
    expect(McpRegistry.get('ext_github_list_repos')).toBeDefined();

    // filesystem 没注册
    expect(McpRegistry.get('ext_filesystem_echo')).toBeUndefined();

    // disabled_one / builtin_one 完全没尝试连接
    expect(MockedMcpClient).toHaveBeenCalledTimes(2);

    // 清理
    await fs.rm(tmpDir, { recursive: true });
  });

  it('returns zero when config has only builtin / disabled servers', async () => {
    const fs = require('fs/promises');
    const path = require('path');
    const os = require('os');

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    const cfgPath = path.join(tmpDir, 'mcp-servers.json');
    await fs.writeFile(
      cfgPath,
      JSON.stringify({
        servers: [
          { name: 'a', transport: 'builtin', enabled: true },
          { name: 'b', transport: 'stdio', enabled: false },
        ],
      }),
    );

    const result = await ExternalMcpLoader.loadFromConfig(cfgPath);
    expect(result.loaded).toBe(0);
    expect(result.registeredTools).toBe(0);

    await fs.rm(tmpDir, { recursive: true });
  });

  it('returns error if config file unreadable', async () => {
    const result = await ExternalMcpLoader.loadFromConfig('/nonexistent/path.json');
    expect(result.loaded).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/config read failed/);
  });
});

describe('ExternalMcpLoader - reset', () => {
  it('8) clears all clients + tool mappings + status', async () => {
    const mock = makeMockClient([{ name: 'tool_a' }]);
    await ExternalMcpLoader.registerFromClient('srv', mock);

    expect(ExternalMcpLoader.listStatus()).toHaveLength(1);
    ExternalMcpLoader.reset();

    expect(ExternalMcpLoader.listStatus()).toEqual([]);
    // tool 仍在 Registry（reset 不删 Registry，只清 loader 状态）
    // 因为 loader 是 bootstrap 层的，reset 是测试 helper
  });
});
