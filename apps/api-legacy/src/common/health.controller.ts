import { Controller, Get } from '@nestjs/common';

/**
 * 健康检查端点（docker healthcheck / 负载均衡探测用）
 * 简单返回 OK，不依赖任何外部服务
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
