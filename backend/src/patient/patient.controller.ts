import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ZodValidationPipe } from 'src/shared.decoraters';
import {
  AllPatientsI,
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
}
