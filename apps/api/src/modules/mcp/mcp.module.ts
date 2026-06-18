/**
 * MCP Module
 *
 * P1-4 修复：接入 MCP 协议
 * - McpAdapterService: 把内部工具暴露成 MCP 格式
 * - 保留现有 McpRegistry 作为内部抽象
 */
import { Module } from '@nestjs/common';
import { McpAdapterService } from './mcp-adapter.service';

@Module({
  providers: [McpAdapterService],
  exports: [McpAdapterService],
})
export class McpModule {}
