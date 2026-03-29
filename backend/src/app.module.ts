import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './controller/health.controller';
import { PublicController } from './controller/public.controller';
import { StreamController } from './controller/stream.controller';
import { PatientController } from './patient/patient.controller';
import { PatientService } from './patient/patient.service';
import { PrismaModule } from './service/prisma.module';
import { RedisService } from './service/redis.service';
import { StreamService } from './service/stream.service';
import { MatcherService } from './service/matcher.service';
import { DoctorController } from './controller/doctor.controller';
import { SendController } from './controller/send.controller';
import { WorkflowService } from './workflow/workflow.service';
import { WorkspaceController } from './workspace/workspace.controller';
import { WorkspaceService } from './workspace/workspace.service';
import { WorkflowController } from './workflow/workflow.controller';

@Module({
  imports: [PrismaModule, AuthModule, ScheduleModule.forRoot()],
  controllers: [
    HealthController,
    StreamController,
    PublicController,
    AdminController,
    PatientController,
    DoctorController,
    SendController,
    WorkspaceController,
    WorkflowController,
  ],
  providers: [
    RedisService,
    StreamService,
    PatientService,
    AdminService,
    MatcherService,
    WorkflowService,
    WorkspaceService,
  ],
})
export class AppModule {}
