import {
  ConflictException,
  Injectable,
  NotFoundException,
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

  async checkOut(patientId: string): Promise<{ checked_out: true }> {
    const client = this.redisService.client;
    const normalizedPatientId = patientId.trim();

    const patientRecordKeys = await client.keys(
      this.getPatientRecordPattern(normalizedPatientId),
    );

    if (patientRecordKeys.length === 0) {
      throw new NotFoundException(
        `Patient with id ${normalizedPatientId} is not checked in`,
      );
    }

    try {
      const patientRecords = await client.mGet(patientRecordKeys);
      const phoneLookupKeys = patientRecords
        .map((record) => {
          if (!record) {
            return null;
          }

          const parsedRecord = JSON.parse(record) as {
            phone_number?: unknown;
          } | null;

          if (
            !parsedRecord ||
            typeof parsedRecord.phone_number !== 'string' ||
            !parsedRecord.phone_number.trim()
          ) {
            return null;
          }

          return this.getPhoneLookupKey(parsedRecord.phone_number.trim());
        })
        .filter((key): key is string => Boolean(key));

      if (phoneLookupKeys.length > 0) {
        await client.del(phoneLookupKeys);
      }

      await client.del(patientRecordKeys);
    } catch {
      throw new ServiceUnavailableException(
        'Unable to complete patient check-out',
      );
    }

    return { checked_out: true };
  }

  private getPhoneLookupKey(phoneNumber: string): string {
    return `patient:phone:${phoneNumber}`;
  }

  private getPatientRecordKey(patientId: string): string {
    return `patient:record:${patientId}`;
  }

  private getPatientRecordPattern(patientId: string): string {
    return `${this.getPatientRecordKey(patientId)}*`;
  }
}
