import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceService } from './workspace.service';

@ApiTags('workspace')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@UseGuards(JwtAuthGuard)
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('bootstrap')
  bootstrap(@Req() request: AuthenticatedRequest) {
    return this.workspaceService.getBootstrap(request.user);
  }

  @Post('notifications/:notificationId/read')
  markNotificationRead(
    @Req() request: AuthenticatedRequest,
    @Param('notificationId') notificationId: string,
  ) {
    return this.workspaceService.markNotificationRead(
      request.user,
      notificationId,
    );
  }
}
