import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { REDIS_RESERVED_NAMESPACES } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly reservedNamespaces = [...REDIS_RESERVED_NAMESPACES];

  private readonly client: RedisClientType;
  private readonly connectionPromise: Promise<RedisClientType>;

  constructor(private readonly configService: ConfigService) {
    this.client = createClient({
      url: this.configService.getOrThrow<string>('REDIS_URL'),
    });
    this.connectionPromise = this.client.connect();
  }

  async onModuleInit() {
    await this.connectionPromise;
  }

  async onModuleDestroy() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  getClient() {
    return this.client;
  }

  async ping(): Promise<'up' | 'down'> {
    try {
      await this.connectionPromise;
      const result = await this.client.ping();
      return result === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
