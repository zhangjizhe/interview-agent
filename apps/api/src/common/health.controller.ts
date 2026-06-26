import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RedisService } from '../infra/redis/redis.service';

/**
 * 健康检查端点（docker healthcheck / 负载均衡探测用）
 *
 * 2026-06-26 加 /ready（readiness）：真连 Postgres + Redis
 * - liveness（/health）：服务在跑 → 200
 * - readiness（/ready）：依赖都连上 → 200，否则 503（K8s 会切流量）
 */
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async readiness() {
    const checks: Record<string, string> = {};
    let ok = true;

    // Postgres
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch (e: any) {
      checks.postgres = `fail: ${e.message}`;
      ok = false;
    }

    // Redis
    try {
      await this.redis.getClient().ping();
      checks.redis = 'ok';
    } catch (e: any) {
      checks.redis = `fail: ${e.message}`;
      ok = false;
    }

    if (!ok) {
      return { status: 'not_ready', checks, timestamp: new Date().toISOString() };
    }
    return { status: 'ready', checks, timestamp: new Date().toISOString() };
  }
}
