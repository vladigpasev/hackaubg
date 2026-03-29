import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './controller/health.controller';
import { StreamController } from './controller/stream.controller';
import { PatientController } from './patient/patient.controller';
import { PatientService } from './patient/patient.service';
import { PrismaModule } from './service/prisma.module';
import { RedisService } from './service/redis.service';
import { StreamService } from './service/stream.service';
import { MatcherService } from './service/matcher.service';
import { DoctorController } from './controller/doctor.controller';
import { SendController } from './controller/send.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    HealthController,
    StreamController,
    PatientController,
    DoctorController,
    SendController,
  ],
  providers: [RedisService, StreamService, PatientService, MatcherService],
})
export class AppModule {}
