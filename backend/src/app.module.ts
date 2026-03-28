import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './controller/health.controller';
import { StreamController } from './controller/stream.controller';
import { PatientController } from './patient/patient.controller';
import { PatientService } from './patient/patient.service';
import { PrismaModule } from './service/prisma.module';
import { RedisService } from './service/redis.service';
import { StreamService } from './service/stream.service';

@Module({
  imports: [PrismaModule, AuthModule, ScheduleModule.forRoot()],
  controllers: [HealthController, StreamController, PatientController],
  providers: [RedisService, StreamService, PatientService],
})
export class AppModule {}
