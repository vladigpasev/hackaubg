import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from 'src/shared.decoraters';
import {
  AllPatientsI,
  AttachPatientNotePayloadI,
  attachPatientNotePayloadSchema,
  CheckInPayloadI,
  checkInPayloadSchema,
} from './patient.dto';
import { PatientService } from './patient.service';

@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post('check-in')
  checkIn(
    @Body(new ZodValidationPipe(checkInPayloadSchema)) body: CheckInPayloadI,
  ) {
    return this.patientService.checkIn(body);
  }

  @Get('/all')
  async getAllPatients(): Promise<AllPatientsI> {
    return this.patientService.getAllPatients();
  }

  @Delete('check-out/:patient_id')
  checkOut(@Param('patient_id') patientId: string) {
    return this.patientService.checkOut(patientId);
  }

  @Get('details/:patient_id')
  async getPatientDetails(@Param('patient_id') patientId: string) {
    return this.patientService.getPatientDetails(patientId);
  }

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
