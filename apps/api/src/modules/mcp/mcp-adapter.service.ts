/**
 * MCP Adapter Layer - 把内部工具暴露成标准 MCP 协议
 *
 * P1-4 修复：接入 MCP 协议
 * - 保留内部 McpRegistry 作为内部抽象（✅ 已有）
 * - 新增 MCP adapter 把工具暴露成 stdio MCP Server
 * - 这样做的好处：
 *   1. 与现有架构解耦
 *   2. 支持外部 MCP Client 调用
 *   3. stdio 最稳定（先做），Streamable HTTP 后续扩展
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { McpRegistry } from '../interview/services/mcp-registry';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * MCP Server 实例配置
 */
export interface McpServerConfig {
  name: string;
  version: string;
  description?: string;
}

/**
 * MCP Tool 参数定义
 */
interface McpToolParam {
  name: string;
  description: string;
  required: boolean;
  schema?: any;
}

/**
 * MCP Adapter Service
 *
 * 负责：
 * 1. 把 McpRegistry 的工具转成 MCP protocol 格式
 * 2. 处理 MCP Client 的 tool call 请求
 * 3. 返回标准化结果
 */
@Injectable()
export class McpAdapterService implements OnModuleInit {
  private readonly logger = new Logger(McpAdapterService.name);

  /**
   * 获取所有工具的 MCP schema
   */
  getToolsList(): Tool[] {
    const tools = McpRegistry.list();

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: 'object',
        properties: this.inferToolParams(tool.name),
        required: this.getRequiredParams(tool.name),
      },
    }));
  }

  /**
   * 根据工具名推断参数 schema
   * TODO: 未来可以从 McpToolMetadata.configSchema 读取
   */
  private inferToolParams(toolName: string): Record<string, any> {
    const paramMap: Record<string, Record<string, any>> = {
      bocha_search: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
        count: {
          type: 'number',
          description: '返回结果数量（默认 5）',
          default: 5,
        },
      },
      memory_recall: {
        query: {
          type: 'string',
          description: '检索关键词',
        },
        userId: {
          type: 'string',
          description: '用户 ID',
        },
      },
      knowledge_bank: {
        position: {
          type: 'string',
          description: '岗位类型（agent/frontend/backend/algorithm/testing）',
        },
        count: {
          type: 'number',
          description: '返回题目数量（默认 5）',
          default: 5,
        },
      },
      github_lookup: {
        username: {
          type: 'string',
          description: 'GitHub 用户名',
        },
      },
    };

    return paramMap[toolName] || {
      args: {
        type: 'string',
        description: '工具参数（JSON 格式）',
      },
    };
  }

  private getRequiredParams(toolName: string): string[] {
    const requiredMap: Record<string, string[]> = {
      bocha_search: ['query'],
      memory_recall: ['query', 'userId'],
      knowledge_bank: ['position'],
      github_lookup: ['username'],
    };
    return requiredMap[toolName] || [];
  }

  /**
   * 执行工具调用
   */
  async callTool(toolName: string, args: any): Promise<any> {
    const tool = McpRegistry.get(toolName);

    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Tool '${toolName}' not found` }),
          },
        ],
      };
    }

    if (!tool.execute) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Tool '${toolName}' not executable (no execute function bound)` }),
          },
        ],
      };
    }

    try {
      const result = await tool.execute(args);
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: error.message }),
          },
        ],
        isError: true,
      };
    }
  }

  onModuleInit() {
    this.logger.log(`[McpAdapter] Initialized with ${McpRegistry.count()} tools`);
  }
}

/**
 * 创建独立的 MCP stdio Server 进程
 *
 * 这个函数用于启动独立的 MCP Server 进程（通过 spawn）。
 * 与 NestJS 模块分开，作为独立进程运行。
 *
 * 使用方式：
 * ```bash
 * node dist/mcp-server.js
 * ```
 *
 * 或者在 config/mcp-servers.json 中配置：
 * ```json
 * {
 *   "mcpServers": {
 *     "interview-agent": {
 *       "command": "node",
 *       "args": ["dist/mcp-server.js"]
 *     }
 *   }
 * }
 * ```
 */
export async function createMcpStdioServer(config: McpServerConfig) {
  const adapter = new McpAdapterService();
  const tools = adapter.getToolsList();

  const server = new Server(
    {
      name: config.name,
      version: config.version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // 注册 list_tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: adapter.getToolsList(),
    };
  });

  // 注册 call_tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return adapter.callTool(name, args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[MCP Server] ${config.name} v${config.version} started`);

  return server;
}
