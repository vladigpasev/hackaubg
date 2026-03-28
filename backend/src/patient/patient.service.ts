import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from 'src/service/redis.service';
import { CheckInPayloadI, CheckInResponseI } from './patient.dto';

@Injectable()
export class PatientService {
  constructor(private readonly redisService: RedisService) {}

  async checkIn(payload: CheckInPayloadI): Promise<CheckInResponseI> {
    const client = this.redisService.client;

    const normalizedPhone = payload.phone_number.trim();
    const phoneLookupKey = this.getPhoneLookupKey(normalizedPhone);
    const existingPatientId = await client.get(phoneLookupKey);

    if (existingPatientId) {
      throw new ConflictException(
        `Patient with phone number ${normalizedPhone} is already checked in`,
      );
    }

    const now = new Date();
    const record: CheckInResponseI = {
      id: randomUUID(),
      name: payload.name.trim(),
      phone_number: normalizedPhone,
      triage_state: payload.triage_state,
      admitted_at: now,
    };

    const patientRecordKey = this.getPatientRecordKey(record.id);

    const reservationResult = await client.set(phoneLookupKey, record.id, {
      NX: true,
    });

    if (reservationResult !== 'OK') {
      throw new ConflictException(
        `Patient with phone number ${normalizedPhone} is already checked in`,
      );
    }

    try {
      await client.set(
        patientRecordKey,
        JSON.stringify({
          ...record,
          admitted_at: record.admitted_at.toISOString(),
        }),
      );
    } catch {
      await client.del(phoneLookupKey);
      throw new ServiceUnavailableException(
        'Unable to persist patient check-in',
      );
    }

    return record;
  }

  checkOut(patientId: string) {}

  private getPhoneLookupKey(phoneNumber: string): string {
    return `patient:phone:${phoneNumber}`;
  }

  private getPatientRecordKey(patientId: string): string {
    return `patient:record:${patientId}`;
  }
}
