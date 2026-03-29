import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../shared.decoraters';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  addAssignmentsPayloadSchema,
  workspaceNotePayloadSchema,
  type AddAssignmentsPayloadI,
  type WorkspaceNotePayloadI,
} from '../workspace/workspace.types';

@ApiTags('workflow')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@UseGuards(JwtAuthGuard)
@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post('patients/:patientId/assignments')
  addAssignments(
    @Req() request: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(addAssignmentsPayloadSchema))
    payload: AddAssignmentsPayloadI,
  ) {
    return this.workspaceService.addAssignments(
      request.user,
      patientId,
      payload,
    );
  }

  @Post('patients/:patientId/notes')
  addNote(
    @Req() request: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body(new ZodValidationPipe(workspaceNotePayloadSchema))
    payload: WorkspaceNotePayloadI,
  ) {
    return this.workspaceService.addPatientNote(
      request.user,
      patientId,
      payload,
    );
  }

  @Post('doctor-visits/:visitId/start')
  startDoctorVisit(
    @Req() request: AuthenticatedRequest,
    @Param('visitId') visitId: string,
  ) {
    return this.workspaceService.startDoctorVisit(request.user, visitId);
  }

  @Post('doctor-visits/:visitId/not-here')
  markDoctorVisitNotHere(
    @Req() request: AuthenticatedRequest,
    @Param('visitId') visitId: string,
  ) {
    return this.workspaceService.markDoctorVisitNotHere(request.user, visitId);
  }

  @Post('doctor-visits/:visitId/complete')
  completeDoctorVisit(
    @Req() request: AuthenticatedRequest,
    @Param('visitId') visitId: string,
  ) {
    return this.workspaceService.completeDoctorVisit(request.user, visitId);
  }

  @Post('lab-items/:itemId/start')
  startLabItem(
    @Req() request: AuthenticatedRequest,
    @Param('itemId') itemId: string,
  ) {
    return this.workspaceService.startLabItem(request.user, itemId);
  }

  @Post('lab-items/:itemId/not-here')
  markLabItemNotHere(
    @Req() request: AuthenticatedRequest,
    @Param('itemId') itemId: string,
  ) {
    return this.workspaceService.markLabItemNotHere(request.user, itemId);
  }

  @Post('lab-items/:itemId/taken')
  markLabItemTaken(
    @Req() request: AuthenticatedRequest,
    @Param('itemId') itemId: string,
  ) {
    return this.workspaceService.markLabItemTaken(request.user, itemId);
  }

  @Post('lab-items/:itemId/results-ready')
  markLabItemResultsReady(
    @Req() request: AuthenticatedRequest,
    @Param('itemId') itemId: string,
  ) {
    return this.workspaceService.markLabItemResultsReady(request.user, itemId);
  }

  @Post('lab-batches/:batchId/results-ready')
  markLabResultsReady(
    @Req() request: AuthenticatedRequest,
    @Param('batchId') batchId: string,
  ) {
    return this.workspaceService.markLabResultsReady(request.user, batchId);
  }
}
