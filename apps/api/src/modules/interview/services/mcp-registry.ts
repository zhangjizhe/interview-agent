/**
 * MCP 工具注册中心（商用级）
 *
 * 三层数据流：
 * 1. config/mcp-servers.json    ← 启动时加载（git 提交，手动维护）
 * 2. in-memory systemEnabled Map ← 管理员运行时切换（重启后从 config 恢复）
 * 3. Prisma UserToolPreference   ← 用户级别偏好（持久化）
 *
 * 设计原则：
 * - 添加新 MCP = 改 json + npm install + 重启 API（不运行时 add）
 * - 商用基础设施：状态追踪、健康占位、按偏好过滤
 * - 保持向后兼容：McpTool 接口 + register() API 不变
 *
 * 用户故事：
 * - 用户 A 关掉"联网搜索" → 面试官不调用该工具
 * - 管理员系统级关掉"题库" → 所有用户都用不了
 * - 面试 agent 创建时调用 getAvailableTools(userId) 拿到过滤后的工具列表
 */

// 简化日志工具（全局单例无法注入 Logger）
const logInfo = (msg: string) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(msg);
  }
};
const logWarn = (msg: string) => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn(msg);
  }
};

export interface McpToolMetadata {
  name: string;
  displayName: string;
  description: string;
  emoji: string;
  category: 'search' | 'knowledge' | 'code' | 'mcp' | 'custom';
  enabled: boolean;        // 系统级
  author?: string;
  version?: string;
  configSchema?: any;
}

export interface McpTool extends McpToolMetadata {
  execute?(args: any): Promise<any>;
}

/**
 * 内部条目：Registry 存储的工具 + 运行时状态
 */
interface RegistryEntry {
  meta: McpToolMetadata;
  transport: 'builtin' | 'stdio' | 'streamable-http';
  builtin: boolean;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  pid?: number;
  status: 'running' | 'stopped' | 'error' | 'builtin';
  lastHealthCheck?: Date;
  errorMessage?: string;
  systemOverride?: boolean;
  /** 真实执行函数（由 NestJS 模块初始化时 bindExecute 注入） */
  execute?: (args: any) => Promise<any>;
}

/**
 * 全局 Registry 单例
 */
class McpRegistryClass {
  private entries: Map<string, RegistryEntry> = new Map();
  private configLoaded = false;

  // ============ 兼容老 API（in-code register）============

  register(tool: McpTool) {
    const { execute, ...meta } = tool;
    this.entries.set(tool.name, {
      meta,
      transport: 'builtin',
      builtin: true,
      status: 'builtin',
      execute,
    });
  }

  /**
   * NestJS 模块初始化时调用：为已注册的工具绑定真实执行函数
   * 例如 BochaSearchTool.execute 需要 ConfigService，只能在 DI 容器中注入
   */
  bindExecute(name: string, fn: (args: any) => Promise<any>): boolean {
    const e = this.entries.get(name);
    if (!e) return false;
    e.execute = fn;
    return true;
  }

  // ============ 新 API：配置驱动加载 ============

  /**
   * 启动时从 JSON 加载。已存在的（in-code register）会被覆盖。
   * 失败也不抛错——商用项目降级到 in-code 列表。
   */
  async loadFromConfig(configPath: string): Promise<{ loaded: number; errors: string[] }> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const errors: string[] = [];
    let loaded = 0;
    try {
      const absPath = path.resolve(configPath);
      const raw = await fs.readFile(absPath, 'utf-8');
      const config = JSON.parse(raw);

      for (const srv of config.servers || []) {
        try {
          this.registerFromConfig(srv);
          loaded++;
        } catch (e: any) {
          errors.push(`${srv.name}: ${e.message}`);
        }
      }
      this.configLoaded = true;
      logInfo(`[McpRegistry] ✅ Loaded ${loaded} MCP servers from config (${errors.length} errors)`);
    } catch (e: any) {
      errors.push(`config load failed: ${e.message}`);
      logWarn(`[McpRegistry] ⚠️  Could not load config ${configPath}: ${e.message}`);
    }
    return { loaded, errors };
  }

  private registerFromConfig(srv: any) {
    if (!srv.name) throw new Error('server.name required');
    const meta: McpToolMetadata = {
      name: srv.name,
      displayName: srv.displayName || srv.name,
      description: srv.description || '',
      emoji: srv.emoji || '🔧',
      category: srv.category || 'custom',
      enabled: srv.enabled !== false,    // 默认 true
      author: srv.author,
      version: srv.version,
    };
    this.entries.set(srv.name, {
      meta,
      transport: srv.transport || 'builtin',
      builtin: srv.builtin === true || srv.transport === 'builtin',
      command: srv.command,
      args: srv.args,
      url: srv.url,
      env: srv.env,
      status: srv.transport === 'builtin' ? 'builtin' : 'stopped',
    });
  }

  // ============ 列表 API ============

  /**
   * 列出所有工具（合并 enabled = meta.enabled && systemOverride !== false）
   * @param userId  可选 - 传了就同时合并用户级偏好，输出 userEnabled 字段
   */
  list(userId?: string): (McpToolMetadata & { userEnabled?: boolean })[] {
    const list: (McpToolMetadata & { userEnabled?: boolean })[] = [];
    for (const entry of this.entries.values()) {
      const systemEnabled = entry.systemOverride !== undefined
        ? entry.systemOverride
        : entry.meta.enabled;
      const item: any = { ...entry.meta, enabled: systemEnabled };
      if (userId !== undefined) {
        // 占位：调用方会传 userId，由 service 层合并 UserToolPreference
        // 这里只标 userEnabled = systemEnabled（默认一致）
        item.userEnabled = systemEnabled;
      }
      list.push(item);
    }
    return list;
  }

  /**
   * Agent 用：拿到用户级 + 系统级都启用的工具
   * 由 service 层传 userId 进来合并 Prisma UserToolPreference
   */
  async getAvailableTools(userId: string, userPrefMap: Map<string, boolean>): Promise<McpToolMetadata[]> {
    const out: McpToolMetadata[] = [];
    for (const entry of this.entries.values()) {
      const systemEnabled = entry.systemOverride !== undefined
        ? entry.systemOverride
        : entry.meta.enabled;
      if (!systemEnabled) continue;
      const userWants = userPrefMap.get(entry.meta.name);
      if (userWants === false) continue;     // 用户明确关掉
      out.push({ ...entry.meta, enabled: true });
    }
    return out;
  }

  get(name: string): McpTool | undefined {
    const e = this.entries.get(name);
    if (!e) return undefined;
    // 返回真实 execute（若已 bindExecute 注入，则有真实函数，否则为 undefined）
    return { ...e.meta, execute: e.execute };
  }

  count(): number {
    return this.entries.size;
  }

  enabledCount(): number {
    let n = 0;
    for (const e of this.entries.values()) {
      const enabled = e.systemOverride !== undefined ? e.systemOverride : e.meta.enabled;
      if (enabled) n++;
    }
    return n;
  }

  // ============ 运行时状态（给 /admin/mcp 用）============

  /**
   * 给 admin 页用：每个 server 的完整运行时状态
   */
  listWithStatus(): Array<McpToolMetadata & {
    transport: string;
    builtin: boolean;
    status: string;
    lastHealthCheck?: string;
    errorMessage?: string;
    pid?: number;
  }> {
    return Array.from(this.entries.values()).map((e) => {
      const systemEnabled = e.systemOverride !== undefined ? e.systemOverride : e.meta.enabled;
      return {
        ...e.meta,
        enabled: systemEnabled,
        transport: e.transport,
        builtin: e.builtin,
        status: e.status,
        lastHealthCheck: e.lastHealthCheck?.toISOString(),
        errorMessage: e.errorMessage,
        pid: e.pid,
      };
    });
  }

  /**
   * 管理员系统级启停
   */
  setSystemEnabled(name: string, enabled: boolean): boolean {
    const e = this.entries.get(name);
    if (!e) return false;
    e.systemOverride = enabled;
    return true;
  }

  /**
   * 健康检查占位：builtin 工具永远 running；stdio/http 留 hook
   */
  async healthCheck(name: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const e = this.entries.get(name);
    if (!e) return { ok: false, latencyMs: 0, error: 'not found' };
    const start = Date.now();
    try {
      if (e.builtin) {
        e.status = 'builtin';
        e.lastHealthCheck = new Date();
        return { ok: true, latencyMs: Date.now() - start };
      }
      // stdio/http 健康检查留 hook（未来可加 ping 进程 / HTTP HEAD）
      e.status = 'stopped';
      e.lastHealthCheck = new Date();
      return { ok: false, latencyMs: Date.now() - start, error: 'health check not implemented for non-builtin yet' };
    } catch (err: any) {
      e.status = 'error';
      e.errorMessage = err.message;
      e.lastHealthCheck = new Date();
      return { ok: false, latencyMs: Date.now() - start, error: err.message };
    }
  }
}

export const McpRegistry = new McpRegistryClass();

// ===== 内置工具：in-code register（向后兼容，config 加载后会覆盖）=====
import { BochaSearchTool } from '../../agent/tools/bocha-search.tool';

McpRegistry.register({
  name: 'bocha_search',
  displayName: '联网搜索',
  description: '调用博查 AI 搜索最新技术文档、行业资讯',
  emoji: '🔍',
  category: 'search',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});

McpRegistry.register({
  name: 'memory_recall',
  displayName: '长期记忆',
  description: '从候选人历史对话中检索相关记忆',
  emoji: '🧠',
  category: 'knowledge',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});

McpRegistry.register({
  name: 'knowledge_bank',
  displayName: '面试题库',
  description: '按岗位匹配结构化面试题（Agent/前端/测试）',
  emoji: '📚',
  category: 'knowledge',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});

McpRegistry.register({
  name: 'github_get_user',
  displayName: 'GitHub 用户信息',
  description: '查询 GitHub 用户的公开信息（粉丝数、bio、贡献统计）。用于面试场景中评估候选人 GitHub 活跃度',
  emoji: '🐙',
  category: 'mcp',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});

McpRegistry.register({
  name: 'github_list_repos',
  displayName: 'GitHub 仓库列表',
  description: '列出 GitHub 用户的公开仓库，按 stars 排序。用于评估候选人的开源贡献和技术栈',
  emoji: '📦',
  category: 'mcp',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});

McpRegistry.register({
  name: 'github_get_readme',
  displayName: 'GitHub README',
  description: '获取仓库 README 内容（Markdown），用于深入评估候选人的项目质量',
  emoji: '📖',
  category: 'mcp',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});

McpRegistry.register({
  name: 'notion_search',
  displayName: 'Notion 全文搜索',
  description: '在 Notion 工作区全文搜索页面，按 query 匹配标题或内容',
  emoji: '📝',
  category: 'mcp',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});

McpRegistry.register({
  name: 'notion_get_page',
  displayName: 'Notion 页面内容',
  description: '获取 Notion 页面详情（properties + markdown 格式内容）',
  emoji: '📄',
  category: 'mcp',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});

McpRegistry.register({
  name: 'notion_list_databases',
  displayName: 'Notion 数据库列表',
  description: '列出当前 integration 可访问的所有 databases',
  emoji: '🗂️',
  category: 'mcp',
  enabled: true,
  author: 'system',
  version: '1.0.0',
});
