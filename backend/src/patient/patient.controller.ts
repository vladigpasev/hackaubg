import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import {
  AllPatientsI,
  AttachPatientNotePayloadI,
  attachPatientNotePayloadSchema,
  CheckInPayloadI,
  checkInPayloadSchema,
  UpdatePatientI,
  updatePatientPayloadSchema,
} from './patient.dto';
import { PatientService } from './patient.service';

@ApiTags('patients')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Roles('registry')
  @Post('check-in')
  checkIn(
    @Body(new ZodValidationPipe(checkInPayloadSchema)) body: CheckInPayloadI,
  ) {
    return this.patientService.checkIn(body);
  }

  @Roles('registry', 'nurse', 'doctor')
  @Get('/all')
  async getAllPatients(): Promise<AllPatientsI> {
    return this.patientService.getAllPatients();
  }

  @Roles('registry')
  @Delete('check-out/:patient_id')
  checkOut(@Param('patient_id') patientId: string) {
    return this.patientService.checkOut(patientId);
  }

  @Roles('registry', 'nurse')
  @Patch(':patient_id')
  async updatePatient(
    @Param('patient_id') patientId: string,
    @Body(new ZodValidationPipe(updatePatientPayloadSchema))
    body: UpdatePatientI,
  ) {
    return this.patientService.updatePatient(patientId, body);
  }

  @Roles('registry', 'nurse', 'doctor')
  @Get('details/:patient_id')
  async getPatientDetails(@Param('patient_id') patientId: string) {
    return this.patientService.getPatientDetails(patientId);
  }

  @Roles('registry', 'nurse', 'doctor')
  @Post('note/:patient_id')
  @HttpCode(200)
  async attachNote(
    @Param('patient_id') patientId: string,
    @Body(new ZodValidationPipe(attachPatientNotePayloadSchema))
    body: AttachPatientNotePayloadI,
  ): Promise<void> {
    await this.patientService.attachNote(patientId, body);
  }
}
