import { Controller, Get, Post, Body, Param, BadRequestException } from '@nestjs/common';
import { McpRegistry } from './services/mcp-registry';

/**
 * MCP 服务管理 API（系统级，admin 用）
 *
 * 注意：商用项目不做运行时 add/delete MCP server
 *  - 增删 MCP = 改 config/mcp-servers.json + npm install + 重启 API
 *  - 这里的"管理"仅指：系统级启停 + 查看状态 + 健康检查
 *
 * GET    /admin/mcp-servers                       - 所有 server + 状态
 * POST   /admin/mcp-servers/toggle                - 切换系统级启停 {toolName, enabled}
 * GET    /admin/mcp-servers/:name/health          - 单个 server 健康检查
 * POST   /admin/mcp-servers/reload                - 重新加载 config（无需重启 API）
 */
interface ToggleDto {
  toolName: string;
  enabled: boolean;
}

@Controller('admin/mcp-servers')
export class AdminMcpController {
  @Get()
  list() {
    const servers = McpRegistry.listWithStatus();
    return {
      servers,
      count: servers.length,
      runningCount: servers.filter((s) => s.status === 'running' || s.status === 'builtin').length,
    };
  }

  @Post('toggle')
  toggle(@Body() body: ToggleDto) {
    if (!body.toolName || typeof body.enabled !== 'boolean') {
      throw new BadRequestException('toolName, enabled required');
    }
    const ok = McpRegistry.setSystemEnabled(body.toolName, body.enabled);
    if (!ok) throw new BadRequestException(`Unknown tool: ${body.toolName}`);
    return { ok: true, toolName: body.toolName, enabled: body.enabled };
  }

  @Get(':name/health')
  async health(@Param('name') name: string) {
    return McpRegistry.healthCheck(name);
  }

  @Post('reload')
  async reload() {
    const path = require('path').resolve(__dirname, '../../../config/mcp-servers.json');
    const result = await McpRegistry.loadFromConfig(path);
    return { ok: true, ...result };
  }
}
