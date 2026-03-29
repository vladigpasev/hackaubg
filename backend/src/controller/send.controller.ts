import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../shared.decoraters';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { WorkflowService } from '../workflow/workflow.service';
import {
  finishTestPayloadSchema,
  sendPatientPayloadSchema,
  type FinishTestPayloadI,
  type SendPatientPayloadI,
} from '../workflow/workflow.types';

@UseGuards(JwtAuthGuard)
@Controller('/')
export class SendController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('/sendPatient')
  sendPatient(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(sendPatientPayloadSchema))
    payload: SendPatientPayloadI,
  ) {
    return this.workflowService.sendPatient(request.user, payload);
  }

  @Post('/finishTest')
  finishTest(
    @Body(new ZodValidationPipe(finishTestPayloadSchema))
    payload: FinishTestPayloadI,
  ) {
    return this.workflowService.finishTest(payload);
  }
}
