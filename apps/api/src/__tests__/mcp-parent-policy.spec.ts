import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { ExternalMcpLoader } from '../modules/mcp/external-mcp-loader';
import { McpRegistry } from '../modules/interview/services/mcp-registry';
import { McpClient } from '../modules/interview/services/mcp-client';

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({}));
jest.mock('../modules/interview/services/mcp-client');

/** Synthetic client only: no external process, socket, provider request, or tool side effect. */
describe('External MCP parent policy and protocol health independent acceptance', () => {
  let directory: string;
  let client: any;
  const parent = 'acceptance-parent';
  const toolName = 'ext_acceptance_parent_read_fixture';
  beforeEach(async () => {
    ExternalMcpLoader.reset();
    McpRegistry.unregister(parent);
    McpRegistry.unregister(toolName);
    directory = await mkdtemp(path.join(tmpdir(), 'mcp-parent-policy-'));
    client = { connect: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true), listTools: jest.fn().mockResolvedValue([{ name: 'read_fixture', inputSchema: { type: 'object' } }]),
      callTool: jest.fn().mockResolvedValue({ synthetic: true }) };
    (McpClient as jest.MockedClass<typeof McpClient>).mockImplementation(() => client);
    const configPath = path.join(directory, 'config.json');
    await writeFile(configPath, JSON.stringify({ servers: [{ name: parent, transport: 'stdio', command: 'never-executed-mocked-client', enabled: true }] }));
    expect((await McpRegistry.loadFromConfig(configPath)).errors).toEqual([]);
    expect((await ExternalMcpLoader.loadFromConfig(configPath)).errors).toEqual([]);
  });
  afterEach(async () => {
    ExternalMcpLoader.reset();
    McpRegistry.unregister(parent);
    McpRegistry.unregister(toolName);
    await rm(directory, { recursive: true, force: true });
    jest.clearAllMocks();
  });
  it('removes dynamic tools from discovery when their parent server is disabled', async () => {
    expect((await McpRegistry.getAvailableTools('synthetic-user', new Map())).some(tool => tool.name === toolName)).toBe(true);
    McpRegistry.setSystemEnabled(parent, false);
    expect((await McpRegistry.getAvailableTools('synthetic-user', new Map())).some(tool => tool.name === toolName)).toBe(false);
  });
  it('blocks a cached execute reference after its parent server is disabled', async () => {
    const cached = McpRegistry.get(toolName)!.execute!;
    McpRegistry.setSystemEnabled(parent, false);
    await Promise.resolve().then(() => cached({})).catch(() => undefined);
    expect(client.callTool).not.toHaveBeenCalled();
  });
  it('blocks a cached execute reference after the individual tool is disabled', async () => {
    const cached = McpRegistry.get(toolName)!.execute!;
    McpRegistry.setSystemEnabled(toolName, false);
    await Promise.resolve().then(() => cached({})).catch(() => undefined);
    expect(client.callTool).not.toHaveBeenCalled();
  });
  it('checks the connected MCP protocol with listTools without invoking a tool', async () => {
    client.listTools.mockClear();
    const result = await McpRegistry.healthCheck(parent);
    expect(client.listTools).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(client.callTool).not.toHaveBeenCalled();
  });
});
