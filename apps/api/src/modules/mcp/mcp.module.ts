/**
 * MCP Module
 *
 * P1-4 修复：接入 MCP 协议
 * - McpAdapterService: 把内部工具暴露成 MCP 格式（内→外）
 * - ExternalMcpLoader: 把外部 MCP server 工具注册进内部 Registry（外→内）
 * - 保留现有 McpRegistry 作为内部抽象
 *
 * 注：ExternalMcpLoader 是全局单例（与 McpRegistry 风格一致），
 * 通过 useValue 注入，避免在 NestJS DI 容器里产生多实例。
 */
import { Module } from '@nestjs/common';
import { McpAdapterService } from './mcp-adapter.service';
import { ExternalMcpLoader } from './external-mcp-loader';

@Module({
  providers: [
    McpAdapterService,
    {
      provide: 'ExternalMcpLoader',
      useValue: ExternalMcpLoader,
    },
  ],
  exports: [McpAdapterService, 'ExternalMcpLoader'],
})
export class McpModule {}
