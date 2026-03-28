import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getRequiredEnv } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PrismaModule } from '../service/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: getRequiredEnv('JWT_SECRET'),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
