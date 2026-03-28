import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [UsersModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, JwtAuthGuard],
})
export class ProfilesModule {}
