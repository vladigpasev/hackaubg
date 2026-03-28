import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns ok when postgres and redis are reachable', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const redis = {
      ping: jest.fn().mockResolvedValue('up'),
      reservedNamespaces: ['triage:queue:*', 'sessions:*'],
    };

    const service = new HealthService(prisma as never, redis as never);

    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      services: {
        postgres: 'up',
        redis: 'up',
      },
      namespaces: ['triage:queue:*', 'sessions:*'],
    });
  });

  it('returns degraded when postgres is unavailable', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const redis = {
      ping: jest.fn().mockResolvedValue('up'),
      reservedNamespaces: [],
    };

    const service = new HealthService(prisma as never, redis as never);
    const result = await service.readiness();

    expect(result.status).toBe('degraded');
    expect(result.services.postgres).toBe('down');
  });
});
