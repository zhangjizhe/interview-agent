import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service';
import { RedisService } from '../infra/redis/redis.service';
import { Public } from '../modules/auth/public.decorator';

/**
 * 健康检查端点（docker healthcheck / 负载均衡探测用）
 *
 * 2026-06-26 加 /ready（readiness）：真连 Postgres + Redis
 * - liveness（/health）：服务在跑 → 200
 * - readiness（/ready）：依赖都连上 → 200，否则 503（K8s 会切流量）
 */
@Controller('health')
@Public()
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
      checks.postgres = 'fail';
      ok = false;
    }

    // Redis
    try {
      await this.redis.getClient().ping();
      checks.redis = 'ok';
    } catch (e: any) {
      checks.redis = 'fail';
      ok = false;
    }

    try {
      const baseline = await this.prisma.$queryRaw<Array<{ applied: number }>>`
        SELECT COUNT(*)::int AS "applied"
        FROM "_prisma_migrations"
        WHERE "migration_name" = '20260815000000_production_baseline'
          AND "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      `;
      if (baseline[0]?.applied === 1) {
        checks.migration = 'ok';
      } else {
        checks.migration = 'fail';
        ok = false;
      }
    } catch {
      checks.migration = 'fail';
      ok = false;
    }

    if (!ok) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
      });
    }
    return { status: 'ready', checks, timestamp: new Date().toISOString() };
  }
}
