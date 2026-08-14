import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../common/health.controller';

describe('HealthController readiness', () => {
  const redis = { getClient: () => ({ ping: jest.fn() }) };

  it('reports ready only after dependencies and the production baseline are available', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ applied: 1 }]),
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
});
