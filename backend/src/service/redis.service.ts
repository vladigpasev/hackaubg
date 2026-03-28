import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  readonly client: RedisClientType;

  constructor() {
    const redisUrl = process.env.REDIS_URL?.trim();

    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    this.client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: false,
      },
    });

    this.client.on('error', (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Redis connection error';

      this.logger.warn(`Redis connection error: ${message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Redis connection error';
      this.logger.warn(`Unable to connect to Redis: ${message}`);
    }
  }

  async onApplicationShutdown() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
