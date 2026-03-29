import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../shared.decoraters';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { WorkflowService } from '../workflow/workflow.service';
import {
  doctorStatusPayloadSchema,
  type DoctorStatusPayloadI,
} from '../workflow/workflow.types';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('/doctor')
export class DoctorController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Roles('doctor')
  @Post('/status')
  setOnline(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(doctorStatusPayloadSchema))
    { online }: DoctorStatusPayloadI,
  ) {
    return this.workflowService.setDoctorStatus(request.user, online);
  }

  @Roles('doctor')
  @Post('/free')
  free(@Req() request: AuthenticatedRequest) {
    return this.workflowService.freeDoctor(request.user);
  }
}
