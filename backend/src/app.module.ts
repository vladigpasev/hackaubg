import { StreamController } from './controller/stream.controller';
import { HealthController } from './controller/health.controller';
import { PrismaService } from './service/prisma.service';
import { StreamService } from './service/stream.service';
import { RedisService } from './service/redis.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [HealthController, StreamController],
  providers: [PrismaService, RedisService, StreamService],
})
export class AppModule {}
