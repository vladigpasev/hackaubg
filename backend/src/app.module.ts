import { AuthModule } from './auth/auth.module';
import { StreamController } from './controller/stream.controller';
import { HealthController } from './controller/health.controller';
import { PrismaModule } from './service/prisma.module';
import { StreamService } from './service/stream.service';
import { RedisService } from './service/redis.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController, StreamController],
  providers: [RedisService, StreamService],
})
export class AppModule {}
