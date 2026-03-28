import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import path from 'node:path';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './health/health.module';
import { HospitalIntegrationModule } from './hospital-integration/hospital-integration.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RedisModule } from './redis/redis.module';
import { RolesModule } from './roles/roles.module';
import { TriageModule } from './triage/triage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '..', '.env'),
      ],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'SYS:standard',
                },
              },
      },
    }),
    PrismaModule,
    RedisModule,
    UsersModule,
    AuthModule,
    ProfilesModule,
    RolesModule,
    HealthModule,
    TriageModule,
    HospitalIntegrationModule,
  ],
})
export class AppModule {}
