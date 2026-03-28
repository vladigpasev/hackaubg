import { createClient, type RedisClientType } from 'redis';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  readonly client: RedisClientType | null;

  constructor() {
    this.client = process.env.REDIS_URL
      ? createClient({ url: process.env.REDIS_URL })
      : null;

    this.client?.on('error', (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown Redis connection error';

      this.logger.warn(`Redis connection error: ${message}`);
    });
  }

  async onModuleInit() {
    if (!this.client) {
      this.logger.log('REDIS_URL not set, skipping Redis connection');
      return;
    }

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
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }
}
