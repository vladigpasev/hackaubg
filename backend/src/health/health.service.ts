import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async readiness() {
    const [postgres, redis] = await Promise.all([
      this.checkPostgres(),
      this.redisService.ping(),
    ]);

    return {
      status: postgres === 'up' && redis === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        postgres,
        redis,
      },
      namespaces: this.redisService.reservedNamespaces,
    };
  }

  private async checkPostgres(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
