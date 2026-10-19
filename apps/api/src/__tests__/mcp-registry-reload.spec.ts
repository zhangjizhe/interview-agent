import { mkdtemp, writeFile, rm, access } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { McpRegistry } from '../modules/interview/services/mcp-registry';

jest.mock('../modules/agent/tools/bocha-search.tool', () => ({}));

describe('MCP registry reload and honest health regression', () => {
  let directory: string;
  let registry: typeof McpRegistry;
  const server = { name: 'acceptance-tool', transport: 'builtin', builtin: true, enabled: true, displayName: 'Original' };
  const execute = jest.fn().mockResolvedValue({ synthetic: true });

  async function config(servers: unknown[]) {
    const filename = path.join(directory, 'mcp.json');
    await writeFile(filename, JSON.stringify({ servers }));
    return filename;
  }

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mcp-registry-acceptance-'));
    registry = new (McpRegistry.constructor as new () => typeof McpRegistry)();
    execute.mockClear();
  });

  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  it('resolves the deployed controller relative path to the actual API config', async () => {
    const apiRoot = path.resolve(__dirname, '../..');
    const deployedControllerDirectory = path.join(apiRoot, 'dist/modules/interview');
    const resolved = path.resolve(deployedControllerDirectory, '../../../config/mcp-servers.json');
    expect(resolved).toBe(path.join(apiRoot, 'config/mcp-servers.json'));
    await expect(access(resolved)).resolves.toBeUndefined();
  });

  it('preserves bound execution and a system shutdown through metadata reload', async () => {
    expect((await registry.loadFromConfig(await config([server]))).errors).toEqual([]);
    registry.bindExecute(server.name, execute);
    registry.setSystemEnabled(server.name, false);
    expect((await registry.loadFromConfig(await config([{ ...server, displayName: 'Updated' }]))).errors).toEqual([]);
    expect(registry.get(server.name)?.enabled).toBe(false);
    await expect(registry.get(server.name)!.execute!({})).rejects.toThrow('禁用');
    expect(registry.listWithStatus()).toEqual([expect.objectContaining({ displayName: 'Updated', enabled: false, executable: true })]);
    expect(await registry.getAvailableTools('synthetic', new Map())).toEqual([]);
    expect(await registry.healthCheck(server.name)).toMatchObject({ ok: false, error: '工具已被系统禁用' });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ['missing name', [{ ...server, displayName: 'Must not apply' }, {}]],
    ['duplicate name', [{ ...server, displayName: 'Must not apply' }, server]],
    ['changed connection', [{ ...server, displayName: 'Must not apply' }, { name: 'second', transport: 'stdio', command: 'changed' }]],
  ])('rejects %s without partially mutating live metadata or bindings', async (_label, invalidServers) => {
    const second = { name: 'second', transport: 'stdio', command: 'original' };
    await registry.loadFromConfig(await config([server, second]));
    registry.bindExecute(server.name, execute);
    registry.setSystemEnabled(server.name, false);
    const before = registry.listWithStatus();
    const result = await registry.loadFromConfig(await config(invalidServers));
    expect(result.loaded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(registry.listWithStatus()).toEqual(before);
    await expect(registry.get(server.name)!.execute!({})).rejects.toThrow('禁用');
    expect(execute).not.toHaveBeenCalled();
  });

  it('guards cached builtin execution after disable or unregister and permits explicit recovery', async () => {
    await registry.loadFromConfig(await config([server]));
    registry.bindExecute(server.name, execute);
    const cached = registry.get(server.name)!.execute!;
    await expect(cached({ query: 'synthetic' })).resolves.toEqual({ synthetic: true });
    execute.mockClear();
    registry.setSystemEnabled(server.name, false);
    await expect(cached({})).rejects.toThrow('禁用');
    expect(execute).not.toHaveBeenCalled();
    registry.setSystemEnabled(server.name, true);
    await expect(cached({})).resolves.toEqual({ synthetic: true });
    execute.mockClear();
    registry.unregister(server.name);
    await expect(cached({})).rejects.toThrow('禁用');
    expect(execute).not.toHaveBeenCalled();
  });

  it('guards cached child execution against current parent policy', async () => {
    await registry.loadFromConfig(await config([server]));
    registry.register({ name: 'child', displayName: 'Child', description: '', emoji: 'test', category: 'mcp',
      enabled: true, parentServer: server.name, execute });
    const cached = registry.get('child')!.execute!;
    registry.setSystemEnabled(server.name, false);
    expect(registry.get('child')?.enabled).toBe(false);
    await expect(cached({})).rejects.toThrow('禁用');
    expect(execute).not.toHaveBeenCalled();
    registry.setSystemEnabled(server.name, true);
    await expect(cached({})).resolves.toEqual({ synthetic: true });
  });

  it('keeps overrides process-local while a fresh registry restores config defaults', async () => {
    const filename = await config([server]);
    await registry.loadFromConfig(filename);
    registry.bindExecute(server.name, execute);
    const cached = registry.get(server.name)!.execute!;
    registry.setSystemEnabled(server.name, false);
    await registry.loadFromConfig(filename);
    await expect(cached({})).rejects.toThrow('禁用');
    const restarted = new (McpRegistry.constructor as new () => typeof McpRegistry)();
    await restarted.loadFromConfig(filename);
    expect(restarted.get(server.name)?.enabled).toBe(true);
    expect(restarted.get(server.name)?.execute).toBeUndefined();
    expect(registry.get(server.name)?.enabled).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it('retains live state when a config file is missing or malformed', async () => {
    const filename = await config([server]);
    await registry.loadFromConfig(filename);
    const before = registry.listWithStatus();
    expect((await registry.loadFromConfig(path.join(directory, 'missing.json'))).errors).toHaveLength(1);
    await writeFile(filename, '{broken');
    expect((await registry.loadFromConfig(filename)).errors).toHaveLength(1);
    expect(registry.listWithStatus()).toEqual(before);
  });

  it('does not call an unbound builtin healthy, then distinguishes binding from a real tool invocation', async () => {
    await registry.loadFromConfig(await config([server]));
    expect(await registry.healthCheck(server.name)).toMatchObject({ ok: false, error: '尚未绑定执行器' });
    registry.bindExecute(server.name, execute);
    expect(await registry.healthCheck(server.name)).toMatchObject({ ok: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not report an unverified stdio connection or a disabled tool as healthy', async () => {
    await registry.loadFromConfig(await config([{ name: 'stdio-fixture', transport: 'stdio', command: 'never-run' }]));
    expect(await registry.healthCheck('stdio-fixture')).toMatchObject({ ok: false, error: '尚未验证 MCP 协议及调用' });
    expect(registry.listWithStatus()).toEqual([expect.objectContaining({ status: 'unknown', executable: false })]);
    registry.setSystemEnabled('stdio-fixture', false);
    expect(await registry.healthCheck('stdio-fixture')).toMatchObject({ ok: false, error: '工具已被系统禁用' });
  });
});
