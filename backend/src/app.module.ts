import { StreamController } from './controller/stream.controller.js';
import { PrismaService } from './service/prisma.service.js';
import { StreamService } from './service/stream.service.js';
import { RedisService } from './service/redis.service.js';
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [StreamController],
  providers: [PrismaService, RedisService, StreamService],
})
export class AppModule {}
