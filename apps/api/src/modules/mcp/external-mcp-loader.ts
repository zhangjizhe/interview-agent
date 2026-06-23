/**
 * External MCP Loader — 把外部 MCP server 的工具动态注册到 McpRegistry
 *
 * 设计目标（ADR #11 P1）：
 * - 从 config/mcp-servers.json 读取 transport != builtin 的条目
 * - 启动时 lazy connect 每个 MCP server，listTools 拿到 tool 列表
 * - 每个 tool 以 `ext_<server>_<tool>` 命名注册进 McpRegistry（避免和 builtin 重名）
 * - bindExecute 转发到 McpClient.callTool，让多 Agent executor 无缝调用
 * - 任意一个 server 连接失败 → log warn 但不抛错（降级：内置工具仍可用）
 *
 * 跟 McpAdapterService 的关系（对偶）：
 * - McpAdapterService：内 → 外（把内部工具暴露成 MCP server 给外部 Client）
 * - ExternalMcpLoader：外 → 内（把外部 MCP server 的工具注入到内部 Registry）
 *
 * 为什么需要 prefix（`ext_<server>_<tool>`）：
 * - builtin GitHubTool 已经注册了 `github_get_user` 等 3 个 tool
 * - 外部 GitHub MCP server（如 @modelcontextprotocol/server-github）会暴露同名 tool
 * - prefix 避免冲突，让两种实现可以共存或切换
 *
 * 失败降级策略：
 * - connect 失败 → status='error',errorMessage 记录，不阻塞其他 server
 * - listTools 失败 → 同上
 * - 后续 callTool 失败 → execute 返回结构化错误，让 Agent 知道"MCP server 不可用"
 *
 * 面试怎么讲：
 * "MCP 双方向集成——我们既能把内部工具暴露成 stdio MCP server 给外部 Client 调用
 *  （如 Claude Desktop、Cursor），也能把外部 MCP server（如 GitHub MCP、Notion MCP）
 *  的工具通过 SDK Client 注入到我们的 Agent Registry。loader 在启动时 lazy connect，
 *  失败降级不阻塞主流程。"
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { McpClient, type McpClientConfig } from '../interview/services/mcp-client';
import { McpRegistry, type McpToolMetadata } from '../interview/services/mcp-registry';

const logInfo = (msg: string) => {
  if (process.env.NODE_ENV !== 'test') console.log(msg);
};
const logWarn = (msg: string) => {
  if (process.env.NODE_ENV !== 'test') console.warn(msg);
};
const logError = (msg: string) => {
  if (process.env.NODE_ENV !== 'test') console.error(msg);
};

/**
 * 外部 MCP server 加载结果（用于 admin 页面 + 健康检查）
 */
export interface ExternalServerStatus {
  name: string;
  transport: string;
  url?: string;
  command?: string;
  status: 'connected' | 'error' | 'disabled' | 'connecting';
  tools: string[];              // 注册进 Registry 的 tool 名字（含 prefix）
  rawToolCount: number;         // MCP server 实际返回的 tool 数
  latencyMs?: number;
  errorMessage?: string;
}

interface ConfigServer {
  name: string;
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  /** 超时（ms），默认 30000 */
  timeoutMs?: number;
}

interface ConfigFile {
  servers: ConfigServer[];
}

/**
 * 替换 ${VAR} 模板（参考 shell 风格，从 process.env 解析）
 */
function resolveEnvTemplate(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.replace(/\$\{([^}]+)\}/g, (_, key: string) => process.env[key] ?? '');
}

function resolveEnvMap(map: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!map) return map;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = resolveEnvTemplate(v) ?? '';
  }
  return out;
}

class ExternalMcpLoaderClass {
  private clients: Map<string, McpClient> = new Map();
  /** 每个外部 tool 在 Registry 中的注册名 → 对应原始 MCP tool 名（用于 callTool 转发） */
  private toolMapping: Map<string, { serverName: string; rawToolName: string }> = new Map();
  /** 每个 server 的加载状态（admin 页用） */
  private serverStatus: Map<string, ExternalServerStatus> = new Map();
  private loaded = false;

  /**
   * 启动时调用：从 JSON 配置加载所有外部 MCP server，connect + listTools + 注册到 Registry
   *
   * @returns 加载结果摘要（loaded / errors / tools）
   */
  async loadFromConfig(configPath: string): Promise<{
    loaded: number;
    errors: string[];
    registeredTools: number;
  }> {
    const errors: string[] = [];
    let loaded = 0;
    let registeredTools = 0;

    let config: ConfigFile;
    try {
      const absPath = path.resolve(configPath);
      const raw = await fs.readFile(absPath, 'utf-8');
      config = JSON.parse(raw);
    } catch (e: any) {
      errors.push(`config read failed: ${e.message}`);
      logWarn(`[ExternalMcpLoader] ⚠️  Could not read config ${configPath}: ${e.message}`);
      return { loaded, errors, registeredTools };
    }

    const externalServers = (config.servers || []).filter(
      (s) => s.transport && s.transport !== 'builtin' && s.enabled !== false,
    );

    if (externalServers.length === 0) {
      logInfo(`[ExternalMcpLoader] ℹ️  No external MCP servers configured`);
      this.loaded = true;
      return { loaded, errors, registeredTools };
    }

    for (const srv of externalServers) {
      try {
        const tools = await this.connectAndRegister(srv);
        loaded++;
        registeredTools += tools;
      } catch (e: any) {
        errors.push(`${srv.name}: ${e.message}`);
        logError(`[ExternalMcpLoader] ❌ ${srv.name}: ${e.message}`);
        // 失败状态已记录在 serverStatus，继续加载下一个（不阻塞）
      }
    }

    this.loaded = true;
    logInfo(
      `[ExternalMcpLoader] ✅ Loaded ${loaded}/${externalServers.length} external MCP servers, ${registeredTools} tools registered`,
    );
    return { loaded, errors, registeredTools };
  }

  /**
   * 单个 server：connect → listTools → 注册到 Registry
   * 任何环节失败都记录到 serverStatus 并抛错（让调用方决定降级）
   */
  private async connectAndRegister(srv: ConfigServer): Promise<number> {
    if (srv.transport !== 'stdio' && srv.transport !== 'streamable-http') {
      throw new Error(`unsupported transport: ${srv.transport}`);
    }

    const cfg: McpClientConfig = {
      name: srv.name,
      transport: srv.transport as 'stdio' | 'streamable-http',
      command: srv.command,
      args: srv.args,
      env: resolveEnvMap(srv.env),
      url: resolveEnvTemplate(srv.url),
      headers: resolveEnvMap(srv.headers),
      timeoutMs: srv.timeoutMs ?? 30_000,
    };

    this.serverStatus.set(srv.name, {
      name: srv.name,
      transport: srv.transport,
      url: srv.url,
      command: srv.command,
      status: 'connecting',
      tools: [],
      rawToolCount: 0,
    });

    const client = new McpClient(cfg);
    const t0 = Date.now();

    try {
      await client.connect();
      const toolDescriptors = await client.listTools();

      const registeredNames: string[] = [];
      for (const td of toolDescriptors) {
        // prefix 避免和 builtin tool 重名
        const registryName = `ext_${srv.name}_${td.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const meta: McpToolMetadata = {
          name: registryName,
          displayName: `${srv.name} / ${td.name}`,
          description: td.description || `External MCP tool from ${srv.name}`,
          emoji: '🔌',
          category: 'mcp',
          enabled: true,
          author: srv.name,
          version: '1.0.0',
          configSchema: td.inputSchema,
        };

        // 先尝试注册（如果同名 builtin 已存在，跳过并 warn）
        const existing = McpRegistry.get(registryName);
        if (existing) {
          logWarn(
            `[ExternalMcpLoader] ⚠️  ${registryName} already registered, overwriting`,
          );
        }

        // 用 meta 注册（保留 builtin 已绑定的 execute 不覆盖）
        McpRegistry.register({
          ...meta,
          execute: async (args: any) => {
            try {
              const result = await client.callTool(td.name, args);
              return result;
            } catch (e: any) {
              return { error: e.message, server: srv.name, tool: td.name };
            }
          },
        });

        this.toolMapping.set(registryName, { serverName: srv.name, rawToolName: td.name });
        registeredNames.push(registryName);
      }

      this.clients.set(srv.name, client);
      this.serverStatus.set(srv.name, {
        name: srv.name,
        transport: srv.transport,
        url: srv.url,
        command: srv.command,
        status: 'connected',
        tools: registeredNames,
        rawToolCount: toolDescriptors.length,
        latencyMs: Date.now() - t0,
      });

      logInfo(
        `[ExternalMcpLoader] ✅ ${srv.name}: ${registeredNames.length} tools registered (${Date.now() - t0}ms)`,
      );
      return registeredNames.length;
    } catch (e: any) {
      // 失败状态记录，但不抛到上层（loadFromConfig 统一处理）
      this.serverStatus.set(srv.name, {
        name: srv.name,
        transport: srv.transport,
        url: srv.url,
        command: srv.command,
        status: 'error',
        tools: [],
        rawToolCount: 0,
        errorMessage: e.message,
      });
      throw e;
    }
  }

  /**
   * 列出所有外部 server 的运行时状态（admin 页 + /admin/mcp-servers 用）
   */
  listStatus(): ExternalServerStatus[] {
    return Array.from(this.serverStatus.values());
  }

  /**
   * 关闭所有 MCP client 连接（OnModuleDestroy）
   */
  async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    for (const [name, client] of this.clients.entries()) {
      closePromises.push(
        client.close().catch((e) =>
          logWarn(`[ExternalMcpLoader] close ${name} failed: ${e.message}`),
        ),
      );
    }
    await Promise.all(closePromises);
    this.clients.clear();
    this.toolMapping.clear();
    this.loaded = false;
  }

  /**
   * 给单测用：手动注册外部 tool（绕过 config 文件读取 + 真实 connect）
   * 用途：loader.spec.ts 中 mock McpClient 行为，避免真实网络/进程连接
   */
  async registerFromClient(serverName: string, client: McpClient, options?: {
    transport?: string;
    url?: string;
    command?: string;
    timeoutMs?: number;
  }): Promise<number> {
    const toolDescriptors = await client.listTools();
    const registeredNames: string[] = [];
    for (const td of toolDescriptors) {
      const registryName = `ext_${serverName}_${td.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
      McpRegistry.register({
        name: registryName,
        displayName: `${serverName} / ${td.name}`,
        description: td.description || `External MCP tool from ${serverName}`,
        emoji: '🔌',
        category: 'mcp',
        enabled: true,
        author: serverName,
        version: '1.0.0',
        configSchema: td.inputSchema,
        execute: async (args: any) => {
          try {
            return await client.callTool(td.name, args);
          } catch (e: any) {
            return { error: e.message, server: serverName, tool: td.name };
          }
        },
      });
      this.toolMapping.set(registryName, { serverName, rawToolName: td.name });
      registeredNames.push(registryName);
    }
    this.clients.set(serverName, client);
    this.serverStatus.set(serverName, {
      name: serverName,
      transport: options?.transport || 'mock',
      url: options?.url,
      command: options?.command,
      status: 'connected',
      tools: registeredNames,
      rawToolCount: toolDescriptors.length,
    });
    return registeredNames.length;
  }

  /**
   * 给单测用：清理指定 server 注册的所有 tool（从 Registry + 内部 mapping）
   */
  unregisterServer(serverName: string): number {
    let removed = 0;
    for (const [registryName, meta] of this.toolMapping.entries()) {
      if (meta.serverName === serverName) {
        McpRegistry.unregister(registryName);
        this.toolMapping.delete(registryName);
        removed++;
      }
    }
    const client = this.clients.get(serverName);
    if (client) {
      client.close().catch(() => {});
      this.clients.delete(serverName);
    }
    this.serverStatus.delete(serverName);
    return removed;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /** 单测用：清空所有状态 */
  reset(): void {
    this.clients.clear();
    this.toolMapping.clear();
    this.serverStatus.clear();
    this.loaded = false;
  }
}

/**
 * 全局单例 — NestJS onModuleInit / main.ts bootstrap 都通过这个访问
 */
export const ExternalMcpLoader = new ExternalMcpLoaderClass();
