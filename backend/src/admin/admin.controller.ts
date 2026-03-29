import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../shared.decoraters';
import { AdminService } from './admin.service';
import {
  createStaffPayloadSchema,
  type CreateStaffPayload,
  updateStaffPayloadSchema,
  type UpdateStaffPayload,
} from './admin.dto';

@ApiTags('admin')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('staff')
  listStaff() {
    return this.adminService.listStaff();
  }

  @Post('staff')
  createStaff(
    @Body(new ZodValidationPipe(createStaffPayloadSchema))
    body: CreateStaffPayload,
  ) {
    return this.adminService.createStaff(body);
  }

  @Patch('staff/:username')
  updateStaff(
    @Param('username') username: string,
    @Body(new ZodValidationPipe(updateStaffPayloadSchema))
    body: UpdateStaffPayload,
  ) {
    return this.adminService.updateStaff(username, body);
  }

  @Delete('staff/:username')
  deleteStaff(@Param('username') username: string) {
    return this.adminService.deleteStaff(username);
  }
}
