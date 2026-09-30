import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController, REQUIRED_MIGRATIONS } from '../common/health.controller';

describe('HealthController readiness', () => {
  const redis = { getClient: () => ({ ping: jest.fn() }) };

  it('reports ready only after dependencies and every packaged migration are available', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ applied: REQUIRED_MIGRATIONS.length }]),
    };
    const controller = new HealthController(prisma as any, redis as any);

    await expect(controller.readiness()).resolves.toMatchObject({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok', migration: 'ok' },
    });
  });

  it('returns 503 without leaking dependency details when the baseline is missing', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ applied: 0 }]),
    };
    const controller = new HealthController(prisma as any, redis as any);

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('旧基线存在但最新迁移缺失时不得报告 ready', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ applied: REQUIRED_MIGRATIONS.length - 1 }]) };
    await expect(new HealthController(prisma as any, redis as any).readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

});
