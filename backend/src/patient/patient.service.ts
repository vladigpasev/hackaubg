import { Injectable } from '@nestjs/common';
import { CheckInPayloadI } from './patient.dto';

@Injectable()
export class PatientService {
  checkIn(payload: CheckInPayloadI) {}

  checkOut(patientId: string) {}
}
