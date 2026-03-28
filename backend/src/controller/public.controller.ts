import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable, filter } from 'rxjs';
import { PatientService } from '../patient/patient.service';
import { StreamEvent, StreamService } from '../service/stream.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly patientService: PatientService,
    private readonly streamService: StreamService,
  ) {}

  @Get('patient/:patient_phonenumber')
  getPatientDetailsByPhoneNumber(
    @Param('patient_phonenumber') patientPhoneNumber: string,
  ) {
    return this.patientService.getPatientDetailsByPhoneNumber(
      patientPhoneNumber,
    );
  }

  @Sse('stream')
  stream(@Query('patient_id') patientId: string): Observable<StreamEvent> {
    const normalizedPatientId = patientId?.trim();

    if (!normalizedPatientId) {
      throw new BadRequestException('patient_id is required');
    }

    return this.streamService.stream.pipe(
      filter((event) => this.isPatientEvent(event, normalizedPatientId)),
    );
  }

  private isPatientEvent(event: StreamEvent, patientId: string): boolean {
    return (
      typeof event.data === 'object' &&
      event.data !== null &&
      'id' in event.data &&
      event.data.id === patientId
    );
  }
}
