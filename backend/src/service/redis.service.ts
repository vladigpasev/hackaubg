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
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL environment variable is not set');
    }

    this.client = createClient({ url: process.env.REDIS_URL });

    this.client?.on('error', (error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
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
