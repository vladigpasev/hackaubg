import { createClient } from '@redis/client';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RedisService {
  readonly client = createClient();

  constructor() {
    this.client.connect();
  }
}
