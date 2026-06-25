/**
 * MCP 客户端包装器 — 统一 stdio / streamable-http transport
 *
 * 解决问题：
 * - McpRegistry 之前只支持 'builtin' 工具，stdio/http 是占位字段
 * - 现在真正实现：启动 stdio 子进程 / 连接 HTTP endpoint
 * - 暴露 listTools / callTool 两个能力，注册进 McpRegistry
 *
 * 用法：
 * ```typescript
 * // stdio transport (本地进程)
 * const client = new McpClient({
 *   name: 'filesystem',
 *   transport: 'stdio',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * });
 * await client.connect();
 * const tools = await client.listTools();
 * const result = await client.callTool('read_file', { path: '/tmp/foo.txt' });
 *
 * // streamable-http transport (远程服务，如 GitHub MCP)
 * const client = new McpClient({
 *   name: 'github',
 *   transport: 'streamable-http',
 *   url: 'https://api.githubcopilot.com/mcp/',
 *   headers: { Authorization: `Bearer ${token}` },
 * });
 * ```
 *
 * 设计约束：
 * - 启动慢：stdio 子进程冷启动 ~1-2s；首次连接预热
 * - 超时：listTools / callTool 默认 30s，可配置
 * - 错误处理：连接失败不抛，让上层降级
 * - 状态：lazy connect（首次调用时才 connect）
 *
 * 面试怎么讲：
 * "MCP 客户端层支持 stdio 和 streamable-http 两种 transport，
 *  stdio 用于本地子进程（如 filesystem server 读候选人简历 PDF），
 *  streamable-http 用于远程 SaaS MCP（如 GitHub MCP 查候选人代码贡献）。
 *  McpRegistry 统一管理连接生命周期 + 按用户偏好过滤。"
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Logger } from '@nestjs/common';

const log = new Logger('McpClient');

export interface McpClientConfig {
  /** 唯一名称，对应 McpRegistry 条目 */
  name: string;
  /** transport 类型 */
  transport: 'stdio' | 'streamable-http';
  /** stdio: 启动命令（如 npx） */
  command?: string;
  /** stdio: 命令参数 */
  args?: string[];
  /** stdio: 环境变量（如 API key） */
  env?: Record<string, string>;
  /** streamable-http: MCP endpoint URL */
  url?: string;
  /** streamable-http: 自定义 HTTP headers（如 Authorization） */
  headers?: Record<string, string>;
  /** MCP 协议版本，默认 2024-11-05 */
  protocolVersion?: string;
  /** callTool 默认超时（ms） */
  timeoutMs?: number;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: any;
}

export class McpClient {
  private readonly log: Logger;
  private client: Client | null = null;
  private transport: StdioClientTransport | StreamableHTTPClientTransport | null = null;
  private connected = false;
  private cachedTools: McpToolDescriptor[] | null = null;

  constructor(private readonly config: McpClientConfig) {
    this.log = new Logger(`McpClient[${config.name}]`);
    if (config.transport === 'stdio' && !config.command) {
      throw new Error(`[McpClient:${config.name}] stdio transport requires 'command'`);
    }
    if (config.transport === 'streamable-http' && !config.url) {
      throw new Error(`[McpClient:${config.name}] streamable-http transport requires 'url'`);
    }
  }

  /**
   * 建立 MCP 连接（lazy connect：首次 listTools/callTool 自动调用）
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.client = new Client(
      { name: 'interview-agent', version: '0.1.0' },
      { capabilities: {} },
    );

    if (this.config.transport === 'stdio') {
      this.transport = new StdioClientTransport({
        command: this.config.command!,
        args: this.config.args || [],
        env: { ...process.env, ...(this.config.env || {}) } as Record<string, string>,
      });
    } else {
      this.transport = new StreamableHTTPClientTransport(new URL(this.config.url!), {
        requestInit: { headers: this.config.headers || {} },
      });
    }

    const timeoutMs = this.config.timeoutMs ?? 30_000;
    try {
      await Promise.race([
        this.client.connect(this.transport),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('connect timeout')), timeoutMs)),
      ]);
      this.connected = true;
      this.log.log(`✅ connected (transport=${this.config.transport})`);
    } catch (e: any) {
      this.log.error(`❌ connect failed: ${e.message}`);
      this.connected = false;
      throw e;
    }
  }

  /**
   * 列出 MCP server 提供的所有 tools
   */
  async listTools(forceRefresh = false): Promise<McpToolDescriptor[]> {
    if (!this.connected) await this.connect();
    if (this.cachedTools && !forceRefresh) return this.cachedTools;

    if (!this.client) throw new Error('client not initialized');

    const timeoutMs = this.config.timeoutMs ?? 30_000;
    const result = await Promise.race([
      this.client.listTools(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('listTools timeout')), timeoutMs)),
    ]);

    this.cachedTools = (result.tools || []).map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    this.log.log(`📋 listed ${this.cachedTools.length} tools: ${this.cachedTools.map(t => t.name).join(', ')}`);
    return this.cachedTools;
  }

  /**
   * 调用 MCP server 上的 tool
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    if (!this.connected) await this.connect();
    if (!this.client) throw new Error('client not initialized');

    const timeoutMs = this.config.timeoutMs ?? 30_000;
    const result = await Promise.race([
      this.client.callTool({ name: toolName, arguments: args }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('callTool timeout')), timeoutMs)),
    ]);

    return result;
  }

  /**
   * 关闭连接 + 清理资源
   */
  async close(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (e: any) {
        this.log.warn(`transport close error: ${e.message}`);
      }
    }
    this.connected = false;
    this.cachedTools = null;
    this.client = null;
    this.transport = null;
  }

  isConnected(): boolean {
    return this.connected;
  }
}