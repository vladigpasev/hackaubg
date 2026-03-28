import { Module } from '@nestjs/common';
import { HealthController } from './controller/health.controller';
import { StreamController } from './controller/stream.controller';
import { PatientController } from './patient/patient.controller';
import { PatientService } from './patient/patient.service';
import { PrismaService } from './service/prisma.service';
import { RedisService } from './service/redis.service';
import { StreamService } from './service/stream.service';

@Module({
  imports: [],
  controllers: [HealthController, StreamController, PatientController],
  providers: [PrismaService, RedisService, StreamService, PatientService],
})
export class AppModule {}
